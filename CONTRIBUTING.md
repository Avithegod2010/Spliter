# Contributing to Spliter

Thanks for your interest! Spliter is an Expo (SDK 58) + React Native app with a local Kotlin engine.

## Setup

```bash
git clone https://github.com/Avithegod2010/Spliter.git
cd Spliter
npm install
npx expo prebuild -p android --no-install   # only if you need native projects
```

**Requirements:** Node 24, JDK 17, Android SDK (or use EAS builds). Expo Go will NOT work — the app needs its native `spl-io` module.

## Quality gates

Every change must pass:

```bash
npm test          # jest unit tests
npm run typecheck # tsc --noEmit (strict)
npx eslint src    # lint
```

CI runs the same three on every push and PR — keep them green.

## Building

- **Tagged release:** push a `v*` tag — GitHub Actions builds the APK and Play Store AAB automatically and attaches them to the release (see `.github/workflows/release.yml`).
- **Local Gradle build:** `npm run build:local` (Windows) — creates a spaceless junction of the repo at `E:\Dev\Spliter` and runs Gradle from there, because CMake/ninja break on paths with spaces.
- **Cloud build:** `npx eas-cli build -p android --profile production` (requires EAS access; free-tier quota may apply).

## Conventions

- Pure logic lives in `src/lib/*` with colocated tests in `src/lib/__tests__/` — keep functions pure and tested.
- Native IO goes through `src/lib/native-io.ts` (typed wrapper); never call the module directly from screens.
- All file access uses the Storage Access Framework — no storage permissions, ever.
- Splits write parts named `name.ext.NNN` plus a `name.ext.spliter.json` manifest; never break that contract (PC Rejoin Kit depends on it).
