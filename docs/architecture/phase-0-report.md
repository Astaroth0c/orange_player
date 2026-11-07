# Fase 0 — inspeção e viabilidade

**Data:** 2026-11-07  
**Estado:** decisões documentadas; prova de conceito preparada; execução em dispositivo pendente.

## Inspeção do repositório e ambiente

- O repositório local estava sem commits, sem arquivos de aplicação e sem remote configurado.
- O repositório GitHub informado existe, é público e também está vazio. A conexão GitHub autenticada informa permissão de push.
- Não havia `AGENTS.md`, package manager ou scripts de projeto.
- Ambiente disponível: Windows, Node/npm, Python, JDK 21 e Gradle 5.4.1 em cache do usuário.
- Não foi localizado Android SDK em `C:\Users\Robinho\AppData\Local\Android\Sdk` ou `C:\Android\Sdk`; `adb` e emulador também não estão disponíveis no PATH.
- Como não há SDK ou aparelho, a compilação/instalação e a validação de controle remoto e reprodução real não podem ser alegadas nesta etapa.
- O Gradle Wrapper 8.13 foi iniciado com JDK 21 e baixou a distribuição conferida pelo SHA-256 oficial. A configuração de tarefas online ficou sem resposta durante a resolução de plugins; em modo offline, o Gradle confirmou que as dependências Kotlin/Android não estão no cache. Não foi produzido APK.
- A validação local executada nesta etapa confirmou que o `AndroidManifest.xml` é XML válido; isso não substitui compilação nem teste funcional.

## Decisões

1. Android TV será a primeira plataforma, conforme os documentos de produto.
2. A prova de conceito usa Kotlin + AndroidX Media3 ExoPlayer diretamente, sem WebView no caminho de reprodução.
3. A UI compartilhada com React/TypeScript fica em avaliação. Antes de escolhê-la para Android, medir foco D-pad, memória, inicialização, HLS, áudio/legendas e chamadas da ponte em TV Box de entrada.
4. O projeto não inclui playlists, credenciais, conteúdo de terceiros empacotado ou acesso a conteúdo sem autorização. A mídia de demonstração é um stream público de teste do Google.
5. Xtream, M3U, SQLite, credenciais protegidas e autoplay de séries são fases posteriores; esta prova de conceito valida apenas o caminho nativo de vídeo e os controles básicos.

## Prova de conceito

O módulo `android/app` abre um reprodutor Media3 com uma mídia de demonstração pública, controles visíveis, suporte a navegação por D-pad e launchers Android/Leanback. O objetivo é ser instalado e exercitado em Android TV/TV Box, não representar o catálogo final.

## Critérios de validação em hardware

- Instalar e iniciar em Android TV / TV Box de entrada e em telefone Android.
- Navegar, confirmar, pausar, retomar e voltar usando apenas D-pad/controle remoto.
- Reproduzir o stream de demonstração; registrar codec, resolução, estabilidade, memória e falhas.
- Repetir com um HLS de teste legal e uma mídia com faixas de áudio/legenda, registrando recursos que o aparelho realmente oferece.
- Suspender/retomar o app e verificar liberação do player ao sair.
- Só então decidir se a interface Android pode compartilhar React/TypeScript com uma ponte nativa.

## Pendências para avançar

1. Disponibilizar Android SDK (platform-tools, plataforma e build-tools compatíveis) e configurar o caminho no ambiente.
2. Compilar e instalar a prova de conceito, corrigir problemas observados e preencher os resultados acima com o modelo do aparelho e versão Android.
3. Atualizar ADR com medições reais e decisão final sobre WebView.
4. Após aceite da Fase 0, iniciar a fundação (Fase 1): design system, navegação TV-first, foco determinístico e onboarding.

## Como abrir a prova de conceito

Abra `android/` no Android Studio com o Android SDK instalado, sincronize o Gradle e execute a configuração `app` em um aparelho Android. O launcher Leanback permite iniciá-la pela tela inicial de Android TV. O stream exige rede ativa.
