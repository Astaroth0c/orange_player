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
- Web production build: `apps/web/dist/`.
- Web checks: `npm run lint`, `npm run build`, and `npm run test` in `apps/web`; lint passes and all 8 existing tests pass. Vite reports the lazy HLS.js chunk at 578 kB.

## Build prerequisites still outstanding

- Android command-line tools were downloaded from Google's official URL and SHA-256 verified. Installing Platform 36/build tools requires accepting Google's Android SDK license. No APK was generated in this environment because the license was not accepted here.
- AppImage packaging from Windows fails because the build requires creating a symlink and this Windows account lacks that permission. DEB packaging requires `fpm`, which is unavailable on Windows. The Linux CI job builds both on Ubuntu.
- Samsung Tizen WGT and LG webOS IPK need their respective vendor SDKs, developer certificates and target TV/device pairing before the signed packages can be built or smoke-tested.
- No Android TV, Samsung TV or LG TV hardware was available for playback validation.
