# ORANGE Player

Media player IPTV em desenvolvimento, com foco inicial em Android TV/TV Box. Consulte o [Documento Mestre](ORANGE_PLAYER_Documento_Mestre_Codex.md) e o [relatório da Fase 0](docs/architecture/phase-0-report.md) antes de avançar de fase.

## Estado atual

Fase 0: decisões documentadas e prova de conceito nativa AndroidX Media3 preparada. A compilação e os testes em Android TV ainda dependem de Android SDK e hardware/emulador. Nenhuma lista IPTV ou credencial é fornecida.

## Executar a prova de conceito

1. Instale Android Studio com Android SDK Platform 36 e Build Tools compatíveis.
2. Abra a pasta `android/` no Android Studio e sincronize o Gradle, ou execute `android\\gradlew.bat -p android assembleDebug` na raiz.
3. Execute a configuração `app` em um Android TV, TV Box ou aparelho Android conectado à rede.
4. Use o D-pad para focar os controles e OK para iniciar/pausar o vídeo de demonstração.

O stream público de demonstração requer internet; uma compilação bem-sucedida não valida codecs ou desempenho dos TV Boxes.

## Fases seguintes

A sequência de implementação, critérios de aceite e funcionalidades estão definidos no Documento Mestre. Concluir a prova de conceito em hardware é o bloqueio técnico antes da fundação da interface compartilhada.
