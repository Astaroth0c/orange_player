# Platform delivery status

## Implemented

- Shared React/TypeScript catalog UI for live TV, movies, series and episodes.
- Xtream API and M3U/M3U8 imports, worker-based M3U parsing, encrypted local credential vault, favorites, playback progress, Xtream EPG and configurable episode autoplay.
- Web/PWA production build.
- Windows Electron desktop package. Remote media is streamed through a custom protocol; HLS playlists and segment URLs are rewritten for desktop playback.
- Android app shell embeds the web build and uses Media3/ExoPlayer for playback. Its build task copies the web production assets into the APK.
- Samsung Tizen AVPlay playback bridge, package metadata and vendor setup notes; webOS app metadata and web asset packager.
- GitHub Actions workflow builds Windows installers and Linux AppImage/DEB packages on native runners.

## Built in this environment

- Windows installer: `apps/desktop/release/ORANGE Player Setup 0.1.0.exe`.
- Android TV sideload APK: `android/app/build/outputs/apk/debug/app-debug.apk` (debug-key signed and verified; minimum Android API 24).
- LG webOS developer package: `apps/webos/com.orangeplayer.app_1.0.0_all.ipk` (packaged and inspected with webOS CLI 3.2.6).
- Web production build: `apps/web/dist/`.
- Web checks: `npm run lint`, `npm run build`, and `npm run test` in `apps/web`; lint passes and all 8 existing tests pass. Vite reports the lazy HLS.js chunk at 578 kB.

## Build prerequisites still outstanding

- The Android APK is signed with the auto-generated debug key. A production APK requires the owner's long-lived release keystore and alias/password; do not send private keys in chat.
- AppImage packaging from Windows fails because the build requires creating a symlink and this Windows account lacks that permission. DEB packaging requires `fpm`, which is unavailable on Windows. The Linux CI job builds both on Ubuntu.
- Samsung Tizen WGT needs Tizen Studio/Samsung TV Extension, a Samsung developer account, the TV DUID and a matching author/distributor certificate profile. No DUID or Samsung certificate was available, so no installable WGT was generated.
- LG webOS IPK was generated for developer-mode sideloading. Testing it on a TV still needs the LG Developer Mode app, an LG developer login, and the TV paired in webOS CLI.
- No Android TV, Samsung TV or LG TV hardware was available for playback validation.
