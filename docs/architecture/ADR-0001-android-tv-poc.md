# ADR-0001: Prova de conceito nativa para Android TV

- **Status:** proposta validada em documentação; aguardando execução em dispositivo.
- **Data:** 2026-11-07

## Contexto

O Orange Player precisa operar em TV Box de entrada, navegar por D-pad e reproduzir VOD e HLS com controles e faixas de mídia compatíveis com cada dispositivo. O repositório começa vazio. O ambiente atual tem JDK 21, mas não tem Android SDK, `adb`, Gradle configurado para o projeto nem dispositivo/emulador visível.

## Decisão

Começar por um app Android nativo em Kotlin, usando AndroidX Media3 ExoPlayer e `PlayerView` como prova de conceito isolada. A tela declara suporte a Android TV e não requer touchscreen. React/TypeScript continua uma opção para uma futura interface compartilhada, mas a ponte WebView não será adotada sem medições de desempenho, foco D-pad e integração do player no hardware-alvo.

## Evidências e limites

- A documentação oficial lista AndroidX Media3 1.11.1 como versão estável atual e documenta módulos ExoPlayer e HLS.
- A documentação do Android TV exige navegação D-pad; o app deve expor launcher Leanback e não exigir touchscreen.
- A validação funcional de HLS, codecs, áudio, legendas, consumo de memória, suspensão/retorno e desempenho em hardware modesto permanece pendente. Um stream de demonstração público não valida fontes Xtream/M3U nem codecs de todos os aparelhos.
- Nenhum APK será marcado como concluído com base apenas na compilação ou em tela estática.

## Consequências

- Menos camadas no caminho de vídeo e integração direta com os recursos de Media3.
- A interface Android inicial será nativa; contratos de domínio poderão ser compartilhados depois que a prova de conceito medir o custo e benefício.
- Outras plataformas continuam fora desta prova de conceito.

## Referências

- [Media3: releases e dependências](https://developer.android.com/jetpack/androidx/releases/media3)
- [Android TV: controle remoto](https://developer.android.com/training/tv/get-started/controllers)
- [Android TV: criar e executar um app](https://developer.android.com/training/tv/get-started/create)
