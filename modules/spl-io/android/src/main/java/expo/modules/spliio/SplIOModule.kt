package expo.modules.spliio

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job as KotlinJob
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

private const val BUFFER_SIZE = 8 * 1024 * 1024 // 8 MB
private const val EVENT_PROGRESS_INTERVAL_MS = 120L
private const val MIME_PART = "application/octet-stream"
private const val MIME_JSON = "application/json"
private const val MANIFEST_SUFFIX = ".spliter.json"
private val PART_REGEX = Regex("^(.+)\\.(\\d{3})$")

/** Progress callback shared by every job: (phase, bytesDone, bytesTotal, partIndex, partsTotal, message). */
private typealias EmitFn = (String, Long, Long, Long, Long, String?) -> Unit

internal class OperationCancelledException : Exception("cancelled")

class SplIOModule : Module() {
  private val jobs = ConcurrentHashMap<String, RunningJob>()
  private val lastEvents = ConcurrentHashMap<String, Map<String, Any?>>()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("spl-io")
    Events("onJobEvent")

    OnDestroy {
      scope.cancel()
    }

    AsyncFunction("splitAsync") { options: Map<String, Any?>, promise: Promise ->
      val jobId = requireString(options, "jobId")
      runJob(jobId, promise) { cancelFlag, emit ->
        val sourceUri = Uri.parse(requireString(options, "sourceUri"))
        val outputDirUri = Uri.parse(requireString(options, "outputDirUri"))
        val baseName = requireString(options, "baseName")
        val partSize = requireLong(options, "partSizeBytes")
        val computeSha256 = options["computeSha256"] as? Boolean ?: false
        require(partSize > 0) { "partSizeBytes must be positive" }

        val resolver = context.contentResolver
        val digest = if (computeSha256) MessageDigest.getInstance("SHA-256") else null
        val totalSize = querySize(resolver, sourceUri)
        if (totalSize <= 0) throw IOException("Source file is empty or unreadable")
        val partsTotal = (totalSize + partSize - 1) / partSize

        val dirDoc = buildDocumentUri(outputDirUri)
        val children = listChildren(resolver, outputDirUri)

        val writer = PartWriter(resolver, dirDoc, children, baseName, partSize, totalSize, partsTotal, digest, cancelFlag, emit)
        try {
          resolver.openInputStream(sourceUri)?.use { input ->
            writer.writeLoop(input)
          } ?: throw IOException("Cannot open the source file for reading")
        } catch (t: Throwable) {
          // Keep every part written so far — completed and in-flight — so the
          // split can be resumed; only the manifest is (never) written on failure.
          writer.close()
          throw t
        }
        finishSplit(resolver, dirDoc, children, baseName, partSize, totalSize, digest, writer, emit)
      }
    }

    AsyncFunction("resumeAsync") { options: Map<String, Any?>, promise: Promise ->
      val jobId = requireString(options, "jobId")
      runJob(jobId, promise) { cancelFlag, emit ->
        val sourceUri = Uri.parse(requireString(options, "sourceUri"))
        val outputDirUri = Uri.parse(requireString(options, "outputDirUri"))
        val baseName = requireString(options, "baseName")
        val partSize = requireLong(options, "partSizeBytes")
        val computeSha256 = options["computeSha256"] as? Boolean ?: false
        val resumeFromPartIndex = requireLong(options, "resumeFromPartIndex")
        val resumeFromByteOffset = requireLong(options, "resumeFromByteOffset")
        require(partSize > 0) { "partSizeBytes must be positive" }
        require(resumeFromPartIndex >= 1) { "resumeFromPartIndex must be at least 1" }
        require(resumeFromByteOffset >= 0 && resumeFromByteOffset < partSize) { "resumeFromByteOffset is out of range" }

        val resolver = context.contentResolver
        val totalSize = querySize(resolver, sourceUri)
        if (totalSize <= 0) throw IOException("Source file is empty or unreadable")
        val partsTotal = (totalSize + partSize - 1) / partSize
        val doneParts = resumeFromPartIndex - 1
        if (doneParts * partSize >= totalSize) {
          throw IOException("Nothing left to resume — the split is already complete")
        }

        val dirDoc = buildDocumentUri(outputDirUri)
        val children = listChildren(resolver, outputDirUri)

        // Parts 1..P-1 must be complete on disk, otherwise the resumed output
        // would have a hole — refuse instead of producing corrupt parts.
        for (i in 1L..doneParts) {
          if (cancelFlag.get()) throw OperationCancelledException()
          val name = "%s.%03d".format(baseName, i)
          val uri = children[name]
            ?: throw IOException("Cannot resume — part $name is missing from the output folder. Start a new split instead.")
          val size = querySize(resolver, uri)
          if (size != partSize) {
            throw IOException("Cannot resume — $name holds $size bytes, expected $partSize. Start a new split instead.")
          }
        }

        // The in-flight part: its on-disk size is the authoritative append
        // position (a flush can lag behind the last progress event, never lead it).
        val partName = "%s.%03d".format(baseName, resumeFromPartIndex)
        var offset = 0L
        var out: OutputStream? = null
        children[partName]?.let { doc ->
          val size = querySize(resolver, doc)
          if (size > partSize) {
            throw IOException("Cannot resume — $partName is larger than a full part. Start a new split instead.")
          }
          offset = size
          out = runCatching { resolver.openOutputStream(doc, "wa") }.getOrNull()
          if (out == null) {
            // Provider does not support append — truncate and rewrite the part.
            out = resolver.openOutputStream(doc, "w")
            offset = 0
            if (out == null) throw IOException("Could not open part $partName for writing")
          }
        }

        val digest = if (computeSha256) MessageDigest.getInstance("SHA-256") else null
        if (digest != null) {
          // Rebuild the digest state by hashing everything already on disk;
          // the source bytes written from here on are hashed in the copy loop.
          for (i in 1L..doneParts) {
            if (cancelFlag.get()) throw OperationCancelledException()
            hashIntoDigest(resolver, children["%s.%03d".format(baseName, i)]!!, digest)
          }
          if (offset > 0) {
            hashIntoDigest(resolver, children[partName]!!, digest, offset)
          }
        }

        emit("resumed", doneParts * partSize + offset, totalSize, resumeFromPartIndex, partsTotal, null)

        val writer = PartWriter(resolver, dirDoc, children, baseName, partSize, totalSize, partsTotal, digest, cancelFlag, emit)
        try {
          resolver.openInputStream(sourceUri)?.use { input ->
            skipFully(input, doneParts * partSize + offset) { if (cancelFlag.get()) throw OperationCancelledException() }
            writer.beginResume(resumeFromPartIndex, out, offset)
            writer.writeLoop(input)
          } ?: throw IOException("Cannot open the source file for reading")
        } catch (t: Throwable) {
          // Same policy as splitAsync: keep the parts, they remain resumable.
          writer.close()
          throw t
        }
        finishSplit(resolver, dirDoc, children, baseName, partSize, totalSize, digest, writer, emit)
      }
    }

    AsyncFunction("mergeAsync") { options: Map<String, Any?>, promise: Promise ->
      val jobId = requireString(options, "jobId")
      runJob(jobId, promise) { cancelFlag, emit ->
        val partUris = (options["partUris"] as? List<*>)?.map { Uri.parse(it as String) }
          ?: throw IllegalArgumentException("partUris must be a list of file URIs")
        val outputDirUri = Uri.parse(requireString(options, "outputDirUri"))
        val outputName = requireString(options, "outputName")
        val expectedSize = requireLong(options, "expectedSizeBytes")
        val expectedSha = options["expectedSha256"] as? String
        if (partUris.isEmpty()) throw IOException("No parts were selected")

        val resolver = context.contentResolver
        val digest = MessageDigest.getInstance("SHA-256")
        val partSizes = partUris.map { querySize(resolver, it) }
        val bytesTotal = partSizes.sum()
        if (bytesTotal <= 0) throw IOException("Selected parts are empty or unreadable")
        if (expectedSize > 0 && bytesTotal != expectedSize) {
          throw IOException(
            "Selected parts add up to $bytesTotal bytes but the original was $expectedSize — parts are missing or from a different split"
          )
        }

        val dirDoc = buildDocumentUri(outputDirUri)
        listChildren(resolver, outputDirUri)[outputName]?.let {
          runCatching { resolver.delete(it, null, null) }
        }
        val outDoc = insertDocument(resolver, dirDoc, outputName, guessMime(outputName))
          ?: throw IOException("Could not create the output file in the selected folder")
        var bytesDone = 0L
        var lastEmit = 0L

        try {
          resolver.openOutputStream(outDoc, "w")!!.use { out ->
            partUris.forEachIndexed { index, partUri ->
              resolver.openInputStream(partUri)?.use { input ->
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                  if (cancelFlag.get()) throw OperationCancelledException()
                  val read = input.read(buffer)
                  if (read < 0) break
                  out.write(buffer, 0, read)
                  digest.update(buffer, 0, read)
                  bytesDone += read
                  val now = System.currentTimeMillis()
                  if (now - lastEmit >= EVENT_PROGRESS_INTERVAL_MS) {
                    lastEmit = now
                    emit("running", bytesDone, bytesTotal, (index + 1).toLong(), partUris.size.toLong(), null)
                  }
                }
              } ?: throw IOException("Cannot open part ${index + 1} for reading")
            }
          }
        } catch (t: Throwable) {
          runCatching { resolver.delete(outDoc, null, null) }
          throw t
        }

        val sha256 = digest.digest().joinToString("") { "%02x".format(it) }
        val verified = !expectedSha.isNullOrEmpty() && sha256.equals(expectedSha, ignoreCase = true)
        if (!expectedSha.isNullOrEmpty() && !verified) {
          runCatching { resolver.delete(outDoc, null, null) }
          throw IOException("Integrity check failed — the rebuilt file does not match the original fingerprint. The output was not saved.")
        }

        emit("done", bytesDone, bytesTotal, partUris.size.toLong(), partUris.size.toLong(), null)
        mapOf(
          "name" to outputName,
          "sizeBytes" to bytesDone,
          "sha256" to sha256,
          "verified" to verified
        )
      }
    }

    AsyncFunction("cancelJob") { jobId: String, promise: Promise ->
      val job = jobs.remove(jobId)
      job?.cancel?.set(true)
      promise.resolve(job != null)
    }

    AsyncFunction("lastJobEvent") { jobId: String, promise: Promise ->
      promise.resolve(lastEvents[jobId])
    }

    AsyncFunction("fileInfo") { uriString: String, promise: Promise ->
      scope.launch {
        try {
          val uri = Uri.parse(uriString)
          val resolver = context.contentResolver
          promise.resolve(
            mapOf(
              "sizeBytes" to querySize(resolver, uri),
              "name" to queryName(resolver, uri)
            )
          )
        } catch (t: Throwable) {
          promise.reject("E_FILEINFO", t.message ?: "fileInfo failed", t)
        }
      }
    }

    AsyncFunction("freeDiskSpace") { promise: Promise ->
      promise.resolve(usableSpace())
    }

    AsyncFunction("listSplitParts") { dirUriString: String, promise: Promise ->
      scope.launch {
        try {
          val resolver = context.contentResolver
          val treeUri = Uri.parse(dirUriString)
          val children = listChildren(resolver, treeUri)

          val grouped = LinkedHashMap<String, MutableList<Pair<String, Uri>>>()
          for ((name, uri) in children) {
            val match = PART_REGEX.find(name) ?: continue
            grouped.getOrPut(match.groupValues[1]) { mutableListOf() }.add(name to uri)
          }

          val groups = grouped.map { (base, parts) ->
            val sorted = parts.sortedBy { PART_REGEX.find(it.first)!!.groupValues[2].toLong() }
            val manifest = children["${base}${MANIFEST_SUFFIX}"]?.let { readManifest(resolver, it) }
            mapOf(
              "baseName" to base,
              "partNames" to sorted.map { it.first },
              "partSizes" to sorted.map { querySize(resolver, it.second) },
              "partUris" to sorted.map { it.second.toString() },
              "manifest" to manifest
            )
          }
          promise.resolve(mapOf("groups" to groups))
        } catch (t: Throwable) {
          promise.reject("E_LIST", t.message ?: "listSplitParts failed", t)
        }
      }
    }
  }

  // ---- job plumbing -------------------------------------------------------

  private fun runJob(
    jobId: String,
    promise: Promise,
    block: suspend (cancelFlag: AtomicBoolean, emit: EmitFn) -> Any?
  ) {
    val cancel = AtomicBoolean(false)
    val emit: EmitFn = { phase, done, total, partIndex, partsTotal, message ->
      val event = mapOf<String, Any?>(
        "jobId" to jobId,
        "phase" to phase,
        "bytesDone" to done,
        "bytesTotal" to total,
        "partIndex" to partIndex,
        "partsTotal" to partsTotal,
        "message" to message
      )
      lastEvents[jobId] = event
      sendEvent("onJobEvent", event)
    }
    val coroutine = scope.launch {
      try {
        val result = block(cancel, emit)
        promise.resolve(result)
      } catch (t: OperationCancelledException) {
        promise.reject("E_CANCELLED", "Job cancelled", t)
      } catch (t: Throwable) {
        promise.reject("E_JOB", t.message ?: "Job failed", t)
      } finally {
        jobs.remove(jobId)
      }
    }
    jobs[jobId] = RunningJob(cancel, coroutine)
  }

  // ---- options helpers ----------------------------------------------------

  private fun requireString(options: Map<String, Any?>, key: String): String =
    options[key] as? String ?: throw IllegalArgumentException("Missing option: $key")

  private fun requireLong(options: Map<String, Any?>, key: String): Long =
    (options[key] as? Number)?.toLong() ?: throw IllegalArgumentException("Missing option: $key")

  // ---- SAF helpers --------------------------------------------------------

  private fun buildDocumentUri(treeUri: Uri): Uri =
    DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))

  private fun listChildren(resolver: android.content.ContentResolver, treeUri: Uri): MutableMap<String, Uri> {
    val map = LinkedHashMap<String, Uri>()
    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
      treeUri, DocumentsContract.getTreeDocumentId(treeUri)
    )
    resolver.query(
      childrenUri,
      arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME),
      null, null, null
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val docId = cursor.getString(0) ?: continue
        val name = cursor.getString(1) ?: continue
        map[name] = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
      }
    }
    return map
  }

  /** Reads and parses a `*.spliter.json` manifest; null when missing or malformed. */
  private fun readManifest(resolver: android.content.ContentResolver, uri: Uri): Map<String, Any?>? {
    val raw = runCatching {
      resolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return null
    }.getOrNull() ?: return null
    return runCatching {
      val json = JSONObject(raw)
      mapOf<String, Any?>(
        "originalName" to json.optString("originalName", ""),
        "originalSize" to json.optLong("originalSize", -1L),
        "partCount" to json.optLong("partCount", -1L),
        "partSizeBytes" to json.optLong("partSizeBytes", -1L),
        "sha256" to if (json.has("sha256")) json.getString("sha256") else null
      )
    }.getOrNull()
  }

  private fun querySize(resolver: android.content.ContentResolver, uri: Uri): Long {
    if ("file" == uri.scheme) {
      val f = File(uri.path ?: return 0)
      return if (f.exists()) f.length() else 0
    }
    resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst() && !c.isNull(0)) return c.getLong(0)
    }
    return runCatching {
      resolver.openInputStream(uri)?.use { it.available().toLong() } ?: 0L
    }.getOrDefault(0L)
  }

  private fun queryName(resolver: android.content.ContentResolver, uri: Uri): String {
    if ("file" == uri.scheme) return File(uri.path ?: "file").name
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst() && !c.isNull(0)) return c.getString(0)
    }
    return uri.lastPathSegment ?: "file"
  }

  private fun usableSpace(): Long {
    val internal = Environment.getDataDirectory().usableSpace
    val external = context.getExternalFilesDir(null)
    return if (external != null) minOf(internal, external.usableSpace) else internal
  }

  private fun guessMime(name: String): String {
    val ext = MimeTypeMap.getFileExtensionFromUrl(name)?.lowercase()
    val fromMap = if (ext.isNullOrEmpty()) null else ANDROID_MIME_OVERRIDES[ext]
    return fromMap ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext ?: "")
      ?: MIME_PART
  }

  private companion object {
    // Common extensions the platform MimeTypeMap misses or guesses oddly.
    val ANDROID_MIME_OVERRIDES = mapOf(
      "7z" to "application/x-7z-compressed",
      "mkv" to "video/x-matroska",
      "rar" to "application/vnd.rar",
      "apk" to "application/vnd.android.package-archive",
      "iso" to "application/x-iso9660-image",
      "flac" to "audio/flac"
    )
  }
}

// ---- part writing ---------------------------------------------------------

/** Creates a document inside a SAF tree with the given display name. */
private fun insertDocument(resolver: android.content.ContentResolver, dirDocUri: Uri, displayName: String, mime: String): Uri? {
  val values = ContentValues().apply {
    put(DocumentsContract.Document.COLUMN_DISPLAY_NAME, displayName)
    put(DocumentsContract.Document.COLUMN_MIME_TYPE, mime)
  }
  return resolver.insert(dirDocUri, values)
}

/**
 * Writes a source stream into sequential `name.NNN` parts, rolling over at
 * `partSize` bytes. Shared by splitAsync and resumeAsync; the write order,
 * roll rule, and event cadence are identical for both.
 */
private class PartWriter(
  private val resolver: android.content.ContentResolver,
  private val dirDoc: Uri,
  private val children: MutableMap<String, Uri>,
  private val baseName: String,
  private val partSize: Long,
  private val totalSize: Long,
  private val partsTotal: Long,
  private val digest: MessageDigest?,
  private val cancelFlag: AtomicBoolean,
  private val emit: EmitFn
) {
  var partIndex = 0L
    private set
  var bytesDone = 0L
    private set
  private var out: OutputStream? = null
  private var writtenToPart = 0L
  private var openNewPart = true
  private var lastEmit = 0L

  /** Continue an interrupted split: part `partIndexStart` already holds `offsetInPart` bytes. */
  fun beginResume(partIndexStart: Long, preopened: OutputStream?, offsetInPart: Long) {
    require(preopened != null || offsetInPart == 0L) { "Resume offset without an open part stream" }
    partIndex = partIndexStart
    out = preopened
    writtenToPart = offsetInPart
    openNewPart = preopened == null
    bytesDone = (partIndexStart - 1) * partSize + offsetInPart
  }

  fun writeLoop(input: InputStream) {
    val buffer = ByteArray(BUFFER_SIZE)
    while (true) {
      if (cancelFlag.get()) throw OperationCancelledException()
      val read = input.read(buffer)
      if (read < 0) break
      digest?.update(buffer, 0, read)
      var offset = 0
      while (offset < read) {
        if (openNewPart) {
          out?.flush()
          out?.close()
          out = null
          partIndex += 1
          openPart(partIndex)
        }
        val room = partSize - writtenToPart
        val toWrite = minOf(room, (read - offset).toLong()).toInt()
        out!!.write(buffer, offset, toWrite)
        writtenToPart += toWrite
        bytesDone += toWrite
        offset += toWrite
        if (writtenToPart == partSize) {
          // Roll lazily: an exactly-fitting file never gets a trailing empty part.
          openNewPart = true
        }
      }
      val now = System.currentTimeMillis()
      if (now - lastEmit >= EVENT_PROGRESS_INTERVAL_MS) {
        lastEmit = now
        emit("running", bytesDone, totalSize, partIndex, partsTotal, null)
      }
    }
    out?.flush()
  }

  /** Flush and release the current part; its bytes stay on disk for resume. */
  fun close() {
    runCatching { out?.flush() }
    runCatching { out?.close() }
    out = null
  }

  private fun openPart(index: Long) {
    val partName = "%s.%03d".format(baseName, index)
    children[partName]?.let { runCatching { resolver.delete(it, null, null) } }
    val doc = insertDocument(resolver, dirDoc, partName, MIME_PART)
      ?: throw IOException("Could not create part file $partName in the selected folder")
    out = resolver.openOutputStream(doc, "w")
      ?: throw IOException("Could not open part file $partName for writing")
    writtenToPart = 0
    openNewPart = false
  }
}

/** Shared tail of splitAsync/resumeAsync: verify, write the manifest, build the result. */
private fun finishSplit(
  resolver: android.content.ContentResolver,
  dirDoc: Uri,
  children: MutableMap<String, Uri>,
  baseName: String,
  partSize: Long,
  totalSize: Long,
  digest: MessageDigest?,
  writer: PartWriter,
  emit: EmitFn
): Map<String, Any?> {
  writer.close()
  if (writer.bytesDone != totalSize) {
    throw IOException("Read ${writer.bytesDone} of $totalSize bytes — the source changed during the split")
  }
  val partCount = writer.partIndex
  if (partCount < 1) throw IOException("No parts were written")

  val sha256 = digest?.digest()?.joinToString("") { "%02x".format(it) }
  val manifestName = "$baseName$MANIFEST_SUFFIX"
  children[manifestName]?.let { runCatching { resolver.delete(it, null, null) } }
  val manifestJson = JSONObject().apply {
    put("app", "Spliter")
    put("format", 1)
    put("originalName", baseName)
    put("originalSize", totalSize)
    put("partCount", partCount)
    put("partSizeBytes", partSize)
    if (sha256 != null) put("sha256", sha256)
    put("createdAt", System.currentTimeMillis())
    put("partPattern", "%03d")
  }
  val manifestDoc = insertDocument(resolver, dirDoc, manifestName, MIME_JSON)
    ?: throw IOException("Could not create the manifest file")
  resolver.openOutputStream(manifestDoc, "w")!!.use { os ->
    os.write(manifestJson.toString().toByteArray(Charsets.UTF_8))
    os.flush()
  }

  val parts = (1L..partCount).map { i ->
    mapOf(
      "name" to "%s.%03d".format(baseName, i),
      "index" to i,
      "sizeBytes" to (if (i == partCount) totalSize - partSize * (partCount - 1) else partSize)
    )
  }
  emit("done", totalSize, totalSize, partCount, partCount, null)
  return mapOf(
    "parts" to parts,
    "totalSize" to totalSize,
    "partSizeBytes" to partSize,
    "sha256" to sha256,
    "manifestName" to manifestName
  )
}

/**
 * Discards exactly `count` bytes from the stream: InputStream.skip may
 * under-return or throw, so fall back to read-and-drop until done.
 */
private fun skipFully(input: InputStream, count: Long, checkCancelled: () -> Unit) {
  var remaining = count
  val buffer = ByteArray(BUFFER_SIZE)
  while (remaining > 0) {
    checkCancelled()
    val skipped = runCatching { input.skip(remaining) }.getOrDefault(0L)
    if (skipped > 0) {
      remaining -= skipped
      continue
    }
    val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
    if (read < 0) {
      throw IOException("The source file is shorter than the split progress — it changed since the split started")
    }
    remaining -= read
  }
}

/** Feeds up to `limitBytes` of a document into the digest (whole document by default). */
private fun hashIntoDigest(
  resolver: android.content.ContentResolver,
  uri: Uri,
  digest: MessageDigest,
  limitBytes: Long = Long.MAX_VALUE
) {
  resolver.openInputStream(uri)?.use { input ->
    val buffer = ByteArray(BUFFER_SIZE)
    var remaining = limitBytes
    while (remaining > 0) {
      val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
      if (read < 0) break
      digest.update(buffer, 0, read)
      remaining -= read
    }
  } ?: throw IOException("Cannot re-read the split output for hashing")
}

private class RunningJob(val cancel: AtomicBoolean, val coroutine: KotlinJob)
