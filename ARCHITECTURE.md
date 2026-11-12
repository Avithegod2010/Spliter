# Spliter architecture

A one-page map of how Spliter is built, for contributors.

## Layers

```
┌────────────────────────── JS / TS (Expo SDK 58 · RN 0.88) ──────────────────────────┐
│ src/app (expo-router)      src/components        src/theme   src/state              │
│  (tabs) Split/Rejoin/      GlassCard, Ring,      tokens,     zustand + AsyncStorage │
│  History/Settings +        chips, badges,        palettes,   (settings, history)    │
│  batch + share-in flows    SuccessBurst                                 │
│                                                                                      │
│ src/lib: split-math · manifest · pc-commands · presets · format (pure, unit-tested)  │
│          native-io (typed wrapper) · job-engine (progress, cancel, resync)           │
└──────────────────────────────┬───────────────────────────────────────────────────────┘
                               │ Expo Modules API (promises + onJobEvent stream)
┌──────────────────────────────▼───────────────────────────────────────────────────────┐
│ modules/spl-io — local Kotlin module (Android only)                                  │
│   splitAsync · mergeAsync · listSplitParts · fileInfo · freeDiskSpace · cancelJob     │
│   8 MB streaming buffers · SHA-256 while copying · cancel flag checked per chunk      │
│   All IO through the Storage Access Framework (content://) — no storage permissions   │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## Core invariants

1. **Parts contract** — parts are `name.ext.NNN` (3-digit, 1-based); the manifest is
   `name.ext.spliter.json` with `{app, format, originalName, originalSize, partCount,
   partSizeBytes, sha256?, partPattern}`. Every part except the last is exactly
   `partSizeBytes`; the last carries the remainder. PC terminals rejoin with
   `copy /b` / `cat`, so this contract is sacred.
2. **Local-only** — the app performs zero network calls. No accounts, no analytics.
3. **Streamed IO** — no full-file reads anywhere; 8 MB buffers end-to-end.
4. **Cancellable + background-proof** — every job gets a `jobId`; the cancel flag is
   checked per chunk; when the app returns to the foreground, `job-engine` resyncs
   progress from `lastJobEvent`.
5. **Fail safe on integrity** — a SHA-256 mismatch deletes the rebuilt file instead of
   saving a corrupt one.

## Key modules

| Path | Role |
|---|---|
| `src/lib/split-math.ts` | Pure part-size/count math + sequence validation |
| `src/lib/manifest.ts` | Manifest build/parse/validate, part naming |
| `src/lib/pc-commands.ts` | Windows/Unix rejoin command generation |
| `src/lib/native-io.ts` | Typed wrapper over the Kotlin module |
| `src/lib/job-engine.ts` | One-job-at-a-time driver: progress events, cancel, resync |
| `src/state/*` | zustand stores persisted to AsyncStorage |
| `modules/spl-io/` | The Kotlin engine (Expo Modules API) |

## Release flow

Push a tag `v*` → GitHub Actions builds the APK (`production`) and the AAB (`store`)
with `eas build --local` on the runner and attaches both to the release. JS-only fixes
can ship via `eas update` (EAS Update is wired; `runtimeVersion` = appVersion).
