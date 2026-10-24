# Spliter — Implementation Plan

> Splits ANY file (zip, 7z, mp4, apk, anything) into custom-size byte parts and rejoins them — in-app or on any PC.
> Expo SDK ~58 · React Native 0.88 · expo-router · local Kotlin IO module · private GitHub repo.

## 1. Requirements

### Core (ship in v1, non-negotiable)
| # | Feature | Acceptance check |
|---|---------|------------------|
| C1 | Pick any file via system picker (any MIME) | Flow: index → file card shows name/size/type |
| C2 | Configure split: size (MB/GB keypad + presets) OR N parts | Unit-tested math; UI reflects parts count preview |
| C3 | Split with streaming IO, live progress (bytes + part index), cancel | Progress ring updates; cancel removes partial parts |
| C4 | Output to user-picked SAF folder; parts named `name.ext.001…`; manifest `name.ext.spliter.json` | Files exist after job; manifest parses |
| C5 | Rejoin: pick parts (multi-select) or auto-detect via folder/manifest | Merge produces byte-identical file (size check) |
| C6 | Disk-space pre-check before both operations | Job refuses with clear message when short |
| C7 | Edge cases: 0-byte file rejected, file < part size → single part, wrong part order/mismatched parts detected | Unit tests + merge validation |
| C8 | History of jobs (split & merge), persisted, re-run/share | History tab lists jobs after completion |

### Batch-1 unique features (user-approved)
| # | Feature | Acceptance check |
|---|---------|------------------|
| F1 | PC Rejoin Kit: exact Windows `copy /b` and macOS/Linux `cat` commands for the produced parts | Done screen shows both, copy button works |
| F2 | Integrity Vault: optional SHA-256 of source; verified badge on rejoin; per-part size validation | Badge appears only when hash matches |
| F3 | Job History timeline with animated cards, re-run & share actions | History tab renders persisted jobs |
| F4 | Theme Studio: ≥6 accent palettes, dark/light/auto, glass intensity, animation level (full/reduced/off) | Settings changes reflect instantly app-wide |
| F5 | Smart Presets chips: Telegram 2 GB, WhatsApp 2 GB, Discord 10 MB, Gmail 25 MB, FAT32 USB 4 GB, Email-safe 10 MB + custom | One tap sets part size |

## 2. Architecture

```
┌────────────────────────── JS / TS (Expo) ──────────────────────────┐
│ src/app (expo-router)      src/components    src/theme  src/state  │
│  (tabs) Split/Rejoin/      GlassCard,        tokens,    zustand + │
│  History/Settings +        ProgressRing,     palettes,  AsyncStorage│
│  split & merge flows       chips, badges,                (settings,│
│                            SuccessBurst                  history)  │
│ src/lib: split-math · presets · pc-commands · manifest · format    │
│          native-io (typed wrapper, availability check, events)     │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ Expo Modules API (events + promises)
┌──────────────────────────────▼─────────────────────────────────────┐
│ modules/spl-io  (Kotlin, local native module)                      │
│  split() merge() listSplitParts() fileInfo() freeDiskSpace()       │
│  cancelJob(jobId) · progress events · SHA-256 while copying        │
│  All IO: ContentResolver + DocumentsContract (SAF, no permissions) │
└────────────────────────────────────────────────────────────────────┘
```

**Why a native module:** SDK-58 expo-file-system cannot read byte ranges from, or stream-write to, Android `content://` SAF documents from JS (legacy string APIs removed; new `File`/`FileHandle` APIs are path-based only). A local module gives memory-safe streaming (8 MB buffers), native-speed SHA-256, and background-proof execution. The app will NOT run in Expo Go — a graceful fallback screen explains the dev-client requirement.

## 3. Native module contract (`spl-io`)

```ts
type SplitOptions  = { sourceUri: string; outputDirUri: string; baseName: string;
                       partSizeBytes: number; computeSha256: boolean; jobId: string };
type MergeOptions  = { partUris: string[]; outputDirUri: string; outputName: string;
                       expectedSizeBytes?: number; expectedSha256?: string; jobId: string };
type PartInfo      = { name: string; index: number; sizeBytes: number };
type SplitResult   = { parts: PartInfo[]; totalSize: number; sha256?: string;
                       manifestName: string };
type MergeResult   = { name: string; sizeBytes: number; sha256?: string; verified: boolean };
type JobEvent      = { jobId: string; phase: 'running'|'done'|'cancelled'|'error';
                       bytesDone: number; bytesTotal: number;
                       partIndex: number; partsTotal: number; message?: string };
// API: splitAsync(o) · mergeAsync(o) · cancelJob(jobId) ·
//      listSplitParts(dirUri) → { groups: [{ baseName, parts: PartInfo[], manifest? }] }
//      fileInfo(uri) → { sizeBytes, name } · freeDiskSpace() → number
// Events: 'onJobEvent' → JobEvent   (work on background coroutines)
```

Manifest (`*.spliter.json`): `{ app:'Spliter', format:1, originalName, originalSize,
partCount, partSizeBytes, sha256?, createdAt, partPattern:'%03d' }`.

## 4. Task breakdown

| Task | Files | Notes | Acceptance |
|------|-------|-------|-----------|
| T1 deps | package.json | `expo install`: document-picker, file-system, haptics, blur, linear-gradient, font, google-fonts (Space Grotesk, Inter), zustand, async-storage; dev: jest, jest-expo, @types/jest | `npx expo-doctor` clean |
| T2 pure libs + tests | src/lib/{split-math,presets,pc-commands,manifest,format}.ts, src/lib/__tests__/* | pure functions only | jest green |
| T3 native module | modules/spl-io/** | contract above; cancel via flag checked per buffer; cleanup partials on cancel/error | Kotlin compiles (EAS/local build) |
| T4 theme | src/theme/* | tokens, 6+ palettes, dark/light/auto resolver, glass & animation level context | instant switch, no flicker |
| T5 state | src/state/{settings,history}.ts | zustand + AsyncStorage persist | survives restart (persist) |
| T6 components | src/components/* | GlassCard, ProgressRing (reanimated), PresetChips, SizeField, FileCard, VerifiedBadge, SuccessBurst, AnimatedTabBar, EmptyState, FallbackScreen | render in all flows |
| T7 screens | src/app/** | tabs + flows; guard navigation during job; resync progress on foreground; re-run from history | every flow reachable, no dead ends |
| T8 config/docs | app.json, eas.json, README.md, LICENSE, .gitignore | eas profiles: `dev-client` apk, `production` apk; package com.avithegod.spliter | files complete |
| T9 gates | — | tsc --noEmit, jest, expo lint | all green |

## 5. Risks & mitigations
- **Backgrounded JS:** native work continues; UI resubscribes and resyncs via `fileInfo`/last event on foreground.
- **SAF quirks (slow writes on some providers):** progress events keep UX honest; recommend Downloads/local folders in copy.
- **Huge files (10 GB+):** 8 MB buffers, no full-file reads anywhere; cancel flag checked per chunk.
- **SDK-58 API drift:** typed wrapper isolates native calls; availability check drives fallback screen.
- **Part ordering mistakes at merge:** validate contiguous sizes against expected pattern before writing.

## 6. Definition of Done
tsc ✓ · jest ✓ · lint ✓ · C1–C8 ✓ · F1–F5 ✓ · fallback screen ✓ · README/LICENSE/eas.json ✓ · pushed to private repo ✓ · EAS APK produced ✓
