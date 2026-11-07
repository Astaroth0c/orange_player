# ORANGE Player

Player multiplataforma de fontes IPTV autorizadas. Consulte o [Documento Mestre](ORANGE_PLAYER_Documento_Mestre_Codex.md) e os registros de arquitetura antes de configurar os SDKs das plataformas.

## Estado atual

O núcleo React/TypeScript fornece catálogo Xtream e M3U, cofre local criptografado, favoritos, progresso, guia Xtream e autoplay de episódios. Android usa Media3 nativo; Windows usa Electron; Samsung Tizen e LG webOS têm pontos de empacotamento documentados. Nenhuma lista ou credencial é fornecida.

## Executar Android TV

1. Instale Android Studio com Android SDK Platform 36 e Build Tools compatíveis.
2. Abra a pasta `android/` no Android Studio e sincronize o Gradle, ou execute `android\\gradlew.bat -p android assembleDebug` na raiz.
3. Execute a configuração `app` em um Android TV, TV Box ou aparelho Android conectado à rede.
4. Use o D-pad para navegar e OK para abrir e controlar streams da sua fonte.

Uma compilação bem-sucedida não valida codecs ou desempenho nos TV Boxes; confirme os modelos de aparelho desejados em hardware.

## Builds

- Web/PWA: `cd apps/web && npm ci && npm run build`
- Windows desktop installer: `cd apps/desktop && npm ci && npm run dist:win`
- Linux AppImage and DEB: `cd apps/desktop && npm ci && npm run dist:linux` (build on Linux recommended)
- Android TV/mobile APK: `cd android && .\gradlew.bat assembleDebug` (requires JDK 21, Android SDK platform 36 and build tools 36.0.0)
- Samsung Tizen and LG webOS packaging instructions: `apps/tizen/README.md`, `apps/webos/README.md` (vendor SDK, developer certificate/device setup required).

The Android app packages the web interface and uses Media3/ExoPlayer for native stream playback. Desktop uses Electron's media proxy for remote playlists and HLS segments. The web version uses browser playback and requires source servers to allow browser CORS for catalog imports.
