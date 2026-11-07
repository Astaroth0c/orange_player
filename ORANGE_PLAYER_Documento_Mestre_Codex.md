# ORANGE PLAYER
## Documento Mestre de Produto, Arquitetura e Implementação para Codex

**Versão:** 1.0  
**Data:** 07/11/2026  
**Produto:** Aplicativo multiplataforma de reprodução de mídia IPTV  
**Identidade:** Orange Glass UI, com navegação inspirada no Aurora Dashboard do Xbox 360

---

# 1. Objetivo do documento

Este documento define o escopo funcional, a arquitetura, os requisitos de interface, os módulos técnicos, os critérios de qualidade e a estratégia de implementação do ORANGE Player.

O objetivo é orientar o Codex a construir um aplicativo real, modular e testável. O trabalho não deve se limitar a produzir telas estáticas ou protótipos: cada etapa precisa resultar em funcionalidades executáveis, testes e documentação.

O aplicativo deve permitir que o usuário utilize fontes de mídia às quais tenha autorização de acesso, por meio de credenciais Xtream Codes compatíveis ou listas M3U/M3U8.

**Não faz parte do projeto:** fornecer listas IPTV, redistribuir canais, obter conteúdo sem autorização, contornar DRM, remover proteções ou implementar mecanismos de acesso não autorizado.

# 2. Visão do produto

O ORANGE Player será um media player com experiência de televisão premium, inspirado na organização visual do Aurora Dashboard:

- Carrosséis horizontais de capas.
- Conteúdo selecionado em destaque.
- Background cinematográfico relacionado ao item selecionado.
- Navegação por controle remoto, teclado, mouse e toque.
- Cartões translúcidos com efeito glass.
- Destaques e indicadores em laranja.
- Histórico, favoritos e retomada de reprodução.
- Catálogo separado em TV ao vivo, filmes e séries.
- Suporte progressivo a diferentes sistemas operacionais.

## 2.1 Princípios do produto

1. **TV-first:** a experiência principal deve funcionar a vários metros de distância e com controle remoto.
2. **Desempenho:** a interface deve permanecer utilizável em TV Boxes de entrada.
3. **Resiliência:** falhas de rede, fontes indisponíveis ou metadados ausentes não podem derrubar o aplicativo.
4. **Privacidade:** credenciais e histórico pertencem ao usuário e devem ser protegidos.
5. **Modularidade:** interface, catálogo, autenticação e reprodução devem ser desacoplados.
6. **Compatibilidade honesta:** recursos devem ser habilitados conforme as capacidades reais de cada plataforma.
7. **Acessibilidade:** foco visível, tipografia legível, contraste e navegação previsível.

# 3. Plataformas e estratégia de entrega

Não existe um único APK que seja executado nativamente em Windows, Linux, Samsung Tizen e LG webOS. O produto deve compartilhar regras de negócio, design tokens, componentes web quando viável e contratos de API, mas gerar pacotes específicos.

## 3.1 Plataformas-alvo

| Plataforma | Entrega | Estratégia de reprodução |
|---|---|---|
| Android TV / Google TV / TV Box | APK | Kotlin + AndroidX Media3 |
| Android celular/tablet | APK | Kotlin + AndroidX Media3 |
| Windows 10/11 | Instalador | Shell desktop + backend de mídia compatível |
| Linux | AppImage/DEB | Shell desktop + MPV/libmpv quando disponível |
| Samsung Smart TV | Pacote Tizen | Aplicação web + APIs de mídia Tizen/AVPlay conforme modelo |
| LG Smart TV | Pacote webOS | Aplicação web + APIs de mídia webOS |
| Navegador | PWA | HTML5 Media / HLS.js conforme suporte |

## 3.2 Estratégia recomendada

- **Frontend compartilhado:** React + TypeScript.
- **Design system:** CSS variables/design tokens e componentes acessíveis.
- **Android:** aplicativo nativo Kotlin com interface compartilhada em WebView/bridge apenas se a prova de conceito confirmar desempenho e integração; reprodução obrigatoriamente nativa via Media3.
- **Tizen/webOS:** aplicações web separadas, adaptadas às APIs, SDKs e políticas de cada fabricante.
- **Windows/Linux:** shell desktop selecionado após uma prova de conceito. Avaliar Tauri e Electron considerando integração com player, codecs, empacotamento e suporte real.
- **Core compartilhado:** contratos TypeScript, regras de catálogo, parsing, histórico, favoritos, sincronização e testes unitários.

**Decisão técnica obrigatória:** antes de implementar todas as plataformas, construir uma prova de conceito Android TV que valide D-pad, Media3, WebView/bridge (se usada), áudio, legendas, HLS e desempenho em hardware modesto. Registrar os resultados e justificar a arquitetura escolhida.

# 4. Identidade visual: Orange Glass UI

## 4.1 Direção de arte

- Fundo base: grafite quase preto.
- Cor primária: laranja vibrante.
- Superfícies: vidro escuro translúcido.
- Bordas: discretas, com brilho laranja apenas no foco.
- Background: arte cinematográfica com overlay escuro para legibilidade.
- Tipografia: Inter, Roboto ou fonte equivalente com licença adequada.
- Ícones: consistentes, simples e reconhecíveis.
- Animações: curtas, suaves e desativáveis/reduzidas em dispositivos lentos.

## 4.2 Tokens iniciais

| Token | Valor sugerido |
|---|---|
| `color-brand` | `#FF781F` |
| `color-brand-light` | `#FF963F` |
| `color-bg` | `#101419` |
| `color-surface` | `#1B222A` |
| `color-glass` | `rgba(24, 30, 38, 0.76)` |
| `color-text` | `#F4F6F8` |
| `color-muted` | `#AEB7C2` |
| `color-border` | `rgba(255,255,255,0.12)` |
| `radius-card` | `14px` |
| `focus-ring` | `2px solid #FF781F` |

Não usar transparência excessiva sobre textos. O fundo deve ser escurecido automaticamente quando a arte tiver muito contraste ou detalhes.

## 4.3 Estados de interação

Todo controle navegável deve ter estados definidos:

- Normal.
- Focado.
- Selecionado.
- Pressionado.
- Desabilitado.
- Carregando.
- Erro.

O foco deve ser altamente visível, nunca depender apenas de mudança sutil de cor e não pode desaparecer ao fechar diálogos ou atualizar listas.

# 5. Mapa completo de telas

## 5.1 Inicialização

1. Splash screen com logotipo.
2. Animação de inicialização.
3. Verificação de rede.
4. Carregamento de configurações locais.
5. Migração de banco local, quando necessária.
6. Verificação de atualização.
7. Restauração da última sessão.
8. Sincronização incremental.
9. Tela de carregamento do catálogo.
10. Erro de conexão.
11. Servidor indisponível.
12. Manutenção/atualização obrigatória, se aplicável.

A inicialização deve exibir primeiro dados locais disponíveis e atualizar o catálogo em segundo plano. Não bloquear a tela esperando o carregamento completo de imagens ou metadados.

## 5.2 Onboarding e autenticação

1. Boas-vindas.
2. Adicionar fonte.
3. Login Xtream Codes.
4. Importar URL M3U/M3U8.
5. Configuração manual.
6. Testar conexão.
7. Salvar fonte.
8. Seleção de perfil.
9. Gerenciar fontes.
10. Editar fonte.
11. Remover fonte com confirmação.
12. Reconectar.
13. Credenciais inválidas.
14. Fonte expirada/indisponível.
15. Ajuda de configuração.

Campos de autenticação Xtream compatíveis, conforme a API oferecida pelo provedor:
- Nome amigável da fonte.
- URL/base do servidor.
- Usuário.
- Senha.
- Opções de conexão estritamente necessárias.

Não registrar URLs completas com credenciais em logs, analytics ou relatórios de erro.

## 5.3 Home Aurora

Elementos:
- Background contextual do conteúdo em foco.
- Overlay escuro adaptativo.
- Logo e menu principal.
- Carrossel de conteúdos.
- Cartão hero com título e descrição.
- Ações Assistir, Continuar, Detalhes e Favoritar.
- Seção Continuar assistindo.
- Adicionados recentemente.
- Filmes em destaque.
- Séries em destaque.
- Canais favoritos.
- Histórico recente.
- Indicador de fonte/perfil ativo.

Comportamento:
- Ao mover o foco para um item, atualizar o background após pequeno debounce.
- Não carregar todas as imagens de uma vez.
- Manter o foco estável durante atualizações do catálogo.
- Em hardware lento, reduzir blur, parallax e animações.
- Se não houver backdrop, usar poster ou fundo padrão.

## 5.4 Filmes

Telas e filtros:
- Todos.
- Recentes.
- Adicionados recentemente.
- Favoritos.
- Minha lista.
- Gêneros/categorias.
- Busca.
- Detalhes.
- Reprodução.

Detalhes:
- Poster e backdrop.
- Título.
- Sinopse.
- Ano e duração, se disponíveis.
- Gêneros.
- Elenco, se disponível.
- Classificação indicativa, se disponível.
- Fonte de origem.
- Ações Assistir, Continuar e Favoritar.

## 5.5 Séries

- Lista de séries.
- Categorias.
- Busca.
- Detalhes da série.
- Temporadas.
- Episódios.
- Detalhes do episódio.
- Continuar episódio.
- Próximo episódio.
- Histórico da série.

Cada episódio deve indicar:
- Não assistido.
- Em andamento.
- Concluído.

O aplicativo só deve marcar automaticamente um episódio como concluído quando o progresso ultrapassar um limite configurável, por padrão 90%, ou quando o usuário marcar manualmente.

## 5.6 TV ao vivo

- Todos os canais.
- Categorias.
- Favoritos.
- Recentes.
- Busca.
- Lista de canais.
- Player ao vivo.
- Guia EPG.
- Detalhes do programa.
- Programa atual/próximo.

Exibir número, nome, logo quando disponível, programa atual, próximo programa e progresso da programação. Não inventar dados EPG ausentes.

## 5.7 Busca global

Pesquisar em:
- Canais.
- Filmes.
- Séries.
- Episódios.
- Categorias.

Incluir teclado virtual, histórico de busca, limpeza do histórico e resultados agrupados por tipo.

## 5.8 Área pessoal

- Continuar assistindo.
- Minha lista.
- Favoritos.
- Assistidos recentemente.
- Filmes concluídos.
- Séries acompanhadas.
- Perfis.
- Preferências.
- Histórico.
- Gerenciar fontes.

## 5.9 Configurações

- Aparência.
- Tamanho de texto.
- Redução de animações.
- Idioma.
- Região/formato de hora.
- Preferências de reprodução.
- Legendas.
- Áudio.
- Buffer/cache.
- Controle parental.
- PIN.
- Perfis.
- Fontes.
- Privacidade.
- Sincronização.
- Diagnóstico.
- Sobre.
- Atualizações.

# 6. Player de mídia

## 6.1 Requisitos gerais

O player deve ser uma camada independente da interface e utilizar o motor apropriado à plataforma.

Controles:
- Play/pause.
- Volume e mudo.
- Barra de progresso para VOD.
- Avançar/retroceder.
- Seleção de áudio.
- Seleção de legendas.
- Sincronização de legenda.
- Tamanho/cor/fundo/posição da legenda, quando suportado.
- Velocidade de reprodução, quando suportada.
- Tela cheia.
- Bloqueio de controles, se aplicável.
- Informações do conteúdo.
- Próximo episódio.
- Retornar ao catálogo.

Para TV ao vivo, não exibir uma timeline de busca se a fonte não suportar timeshift/catch-up.

## 6.2 Retomada e progresso

Salvar:
- ID interno do item.
- ID da fonte.
- Perfil.
- Posição atual.
- Duração conhecida.
- Data/hora da última reprodução.
- Estado de conclusão.

Regras:
- Salvar progresso em intervalos regulares e ao pausar/sair.
- Evitar gravar a cada frame.
- Ao abrir conteúdo com progresso, oferecer Continuar ou Reiniciar.
- Preservar progresso mesmo após atualização da lista.
- Nunca usar somente a URL como identidade permanente do item.
- Sincronização entre dispositivos deve resolver conflitos usando timestamp e regras documentadas.

## 6.3 Buffer e recuperação

- Buffer adaptado às capacidades do dispositivo.
- Limites de memória configuráveis por classe de hardware.
- Retry com backoff para falhas transitórias.
- Diferenciar falha de rede, autenticação, formato não suportado e fonte indisponível.
- Não entrar em loop infinito de reconexão.
- Permitir cancelar tentativas.
- Exibir mensagem útil e opção de tentar novamente.

## 6.4 Compatibilidade de mídia

Criar uma matriz de testes para:
- HLS.
- MPEG-DASH, quando suportado pela plataforma e pela fonte.
- MP4.
- TS.
- Codecs de vídeo e áudio disponíveis no dispositivo.
- Legendas SRT/WebVTT e faixas incorporadas, conforme suporte.

Não prometer suporte universal a codecs. Consultar capacidades reais do dispositivo e documentar limitações por plataforma.

# 7. Catálogo, fontes e metadados

## 7.1 Fontes

Implementar adaptadores para:
- API Xtream Codes compatível.
- M3U/M3U8.

Cada fonte deve ter:
- ID local estável.
- Nome.
- Tipo.
- Endereço base protegido.
- Credenciais protegidas.
- Estado da última sincronização.
- Estado de conexão.
- Preferências de atualização.

## 7.2 Parsing e atualização

- Parsing incremental quando possível.
- Tratamento de listas malformadas.
- Timeout de rede.
- Paginação/lotes internos.
- Deduplicação controlada.
- Atualização sem apagar dados pessoais.
- Cancelamento de sincronização.
- Relatório de itens ignorados e motivo.

## 7.3 Metadados externos

Integração opcional com serviço de metadados, como TMDb, respeitando termos, limites, atribuição e políticas do serviço.

Metadados:
- Poster.
- Backdrop.
- Sinopse.
- Ano.
- Gênero.
- Elenco.
- Temporadas/episódios quando disponíveis.

A associação deve usar identificadores confiáveis quando disponíveis e correspondência de título/ano com nível de confiança. Não substituir silenciosamente metadados do provedor quando houver conflito. Permitir fallback sem metadados externos.

# 8. Banco de dados local

Utilizar SQLite com migrações versionadas. Avaliar SQLCipher ou mecanismo equivalente se a criptografia integral do banco for necessária e viável na plataforma.

Tabelas propostas:

| Tabela | Finalidade |
|---|---|
| `profiles` | Perfis locais |
| `providers` | Fontes cadastradas |
| `provider_secrets` | Referências a credenciais protegidas |
| `categories` | Categorias por fonte/tipo |
| `channels` | Canais |
| `movies` | Filmes |
| `series` | Séries |
| `seasons` | Temporadas |
| `episodes` | Episódios |
| `favorites` | Favoritos |
| `watch_history` | Histórico |
| `playback_progress` | Progresso |
| `playback_preferences` | Preferências de áudio/legenda |
| `search_history` | Histórico de busca |
| `app_settings` | Configurações |
| `metadata_cache` | Metadados e imagens em cache |
| `sync_jobs` | Estado de sincronizações |

Requisitos:
- Chaves primárias estáveis.
- Índices para busca e filtros.
- Chaves estrangeiras quando aplicável.
- Migrações testadas.
- Exclusão em cascata somente quando segura e documentada.
- Dados pessoais separados dos dados importados.

# 9. Arquitetura de software

## 9.1 Módulos

1. `app-shell`: inicialização, ciclo de vida e navegação.
2. `design-system`: tokens e componentes visuais.
3. `remote-navigation`: foco, D-pad, teclado e controle.
4. `authentication`: perfis e credenciais.
5. `provider-adapters`: Xtream e M3U.
6. `catalog`: normalização e consulta.
7. `metadata`: enriquecimento opcional.
8. `playback`: contrato comum do player.
9. `playback-android`: adaptador Media3.
10. `playback-desktop`: adaptador desktop/MPV.
11. `playback-tizen`: integração de mídia Tizen.
12. `playback-webos`: integração webOS.
13. `history`: histórico e progresso.
14. `favorites`: favoritos e listas.
15. `epg`: guia de programação.
16. `settings`: configurações.
17. `sync`: sincronização opcional.
18. `diagnostics`: logs técnicos sem segredos.

## 9.2 Contrato abstrato do player

Definir uma interface comum com operações equivalentes a:
- `load(item)`
- `play()`
- `pause()`
- `stop()`
- `seekTo(position)`
- `setVolume(value)`
- `selectAudioTrack(trackId)`
- `selectSubtitleTrack(trackId)`
- `setPlaybackSpeed(speed)`
- `getPlaybackState()`
- `dispose()`

A interface deve retornar capacidades suportadas. A UI não deve mostrar controles que o motor/plataforma não consegue executar.

## 9.3 Backend opcional

A primeira versão deve funcionar localmente sem exigir conta em nuvem do ORANGE Player.

Backend posterior pode oferecer:
- Sincronização de progresso.
- Preferências por perfil.
- Backup de configurações.
- Gerenciamento de dispositivos.

Não armazenar senhas de fontes em texto puro no backend. Preferir armazenamento local seguro e sincronização criptografada somente se o desenho de segurança estiver validado.

# 10. Estrutura de repositório sugerida

```text
orange-player/
├── apps/
│   ├── android/
│   ├── web/
│   ├── desktop/
│   ├── tizen/
│   └── webos/
├── packages/
│   ├── design-system/
│   ├── domain/
│   ├── catalog/
│   ├── provider-adapters/
│   ├── metadata/
│   ├── playback-contracts/
│   ├── history/
│   ├── favorites/
│   └── shared-utils/
├── services/
│   └── sync-api/              # fase posterior
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── testing/
│   └── platform-matrix/
├── scripts/
├── .github/
│   └── workflows/
├── README.md
├── CONTRIBUTING.md
└── CODEX_TASKS.md
```

A estrutura final poderá ser ajustada após a prova de conceito. Não criar pastas vazias apenas para aparentar completude.

# 11. Desempenho e compatibilidade

Perfis de dispositivo a considerar:
- Entrada: 1–2 GB RAM.
- Intermediário: 2–4 GB RAM.
- Avançado: 4–8 GB RAM.
- Premium: 8 GB ou mais.

Esses perfis são referências de teste, não garantias de compatibilidade.

Requisitos:
- Carregamento preguiçoso de imagens.
- Cache com limite e política LRU.
- Redimensionamento de imagens para o tamanho necessário.
- Listas virtualizadas.
- Evitar efeitos blur caros em hardware limitado.
- Reduzir animações em dispositivos lentos.
- Não bloquear a thread principal.
- Cancelar requisições obsoletas.
- Tratar suspensão/retorno do aplicativo.
- Suportar 720p, 1080p e 4K quando dispositivo, fonte e conteúdo permitirem.

# 12. Navegação por controle remoto

Mapeamento padrão:
- Cima/baixo/esquerda/direita: mover foco.
- OK/Enter: confirmar.
- Voltar/Escape: retornar/fechar.
- Menu: ações adicionais.
- Play/Pause: reprodução.
- Volume: controle de áudio, quando o sistema permitir.

Critérios:
- Ordem de foco determinística.
- Foco restaurado ao fechar modal.
- Nenhum elemento essencial acessível somente por hover.
- Áreas de foco grandes.
- Indicador visual de foco.
- Teclado virtual para busca.
- Testes com D-pad físico, teclado e controle Bluetooth.

# 13. Segurança, privacidade e conformidade

- Credenciais em armazenamento seguro da plataforma (Android Keystore, Credential Manager ou equivalente).
- Nunca incluir senha em logs, crash reports ou analytics.
- HTTPS sempre que disponível e exigido para serviços próprios.
- Validar URLs e esquemas permitidos.
- Prevenir injeção de conteúdo em WebView.
- Política de Content Security Policy na versão web, quando aplicável.
- Não executar scripts recebidos de listas.
- Não contornar DRM ou restrições técnicas.
- Não incorporar conteúdo sem licença.
- Oferecer política de privacidade clara.
- Coletar apenas telemetria necessária e consentida.
- Permitir apagar histórico, cache, fontes e perfis.
- Proteger PIN e controles parentais com armazenamento seguro.

# 14. Testes e critérios de aceite

## 14.1 Testes funcionais

1. Login válido e inválido.
2. Importação de M3U válida e malformada.
3. Atualização de catálogo.
4. Navegação por categorias.
5. Busca global.
6. Favoritar/desfavoritar.
7. Iniciar filme.
8. Pausar e retomar.
9. Fechar e reabrir o aplicativo.
10. Retomar do ponto salvo.
11. Marcar episódio como concluído.
12. Reproduzir próximo episódio.
13. Selecionar legenda e áudio quando disponíveis.
14. Trocar de perfil.
15. Recuperar falha de rede.
16. Excluir fonte sem apagar dados de outras fontes.

## 14.2 Testes de plataforma

- Android TV com controle remoto.
- Android TV Box de entrada.
- Android TV Box intermediária.
- Android celular.
- Windows.
- Linux.
- Samsung Tizen em modelos/SDKs selecionados.
- LG webOS em modelos/SDKs selecionados.
- Navegadores suportados.

## 14.3 Critérios de aceite da primeira versão Android

A primeira versão só será considerada funcional quando:
- Instalar e iniciar em dispositivo Android TV de teste.
- Permitir adicionar fonte autorizada Xtream ou M3U.
- Importar e apresentar canais, filmes e séries.
- Navegar integralmente com controle remoto.
- Reproduzir conteúdo compatível via Media3.
- Exibir erros compreensíveis.
- Salvar favoritos e progresso localmente.
- Retomar filme do ponto salvo.
- Mostrar temporadas e episódios.
- Marcar episódios assistidos.
- Não perder histórico após reiniciar o aplicativo.
- Não registrar credenciais em logs.
- Passar pelos testes automatizados essenciais.

# 15. Plano de implementação por fases

## Fase 0 — Inspeção e decisões técnicas

- Inspecionar repositório e ambiente.
- Registrar versões de ferramentas.
- Criar ADRs (Architecture Decision Records).
- Escolher estratégia de frontend e integração nativa.
- Criar prova de conceito Android TV com Media3 e controle remoto.
- Documentar limitações.

**Entrega:** decisão arquitetural aprovada por evidências.

## Fase 1 — Fundação

- Criar monorepo.
- Configurar TypeScript e lint.
- Configurar testes.
- Criar design tokens.
- Criar componentes base.
- Implementar roteamento.
- Implementar foco remoto.
- Criar splash e onboarding.

**Entrega:** aplicativo navegável com dados simulados, sem fingir que o player já está pronto.

## Fase 2 — Fontes e catálogo

- Adaptador Xtream.
- Parser M3U/M3U8.
- Banco SQLite.
- Migrações.
- Normalização de catálogo.
- Categorias.
- Busca.
- Atualização incremental.

**Entrega:** catálogo real de uma fonte autorizada, com estados de erro e carregamento.

## Fase 3 — Player Android

- Integração Media3.
- HLS e formatos validados.
- Áudio/legendas.
- Controles de TV.
- Buffer e recuperação.
- Ciclo de vida.
- Testes em hardware real.

**Entrega:** reprodução real e estável dos formatos testados.

## Fase 4 — Experiência completa

- Dashboard Aurora dinâmico.
- Detalhes de filmes e séries.
- Favoritos.
- Histórico.
- Retomada.
- Temporadas e episódios.
- EPG.
- Perfis e controle parental básico.

**Entrega:** primeira versão Android funcional.

## Fase 5 — Metadados e sincronização

- Integração opcional com serviço de metadados.
- Cache de imagens.
- Sincronização, se aprovada.
- Resolução de conflitos.
- Privacidade e segurança revisadas.

**Entrega:** recursos avançados documentados e testados.

## Fase 6 — Outras plataformas

Implementar uma plataforma por vez:
1. Windows.
2. Linux.
3. Web/PWA.
4. Samsung Tizen.
5. LG webOS.

Cada plataforma exige matriz própria de formatos, codecs, controles, instalação e limitações.

# 16. Regras de trabalho para o Codex

O Codex deve seguir estas regras durante todo o projeto:

1. Antes de alterar arquivos, inspecionar o repositório, package manager e ferramentas existentes.
2. Não presumir que o projeto está vazio.
3. Não substituir configurações existentes sem justificar.
4. Trabalhar em fases pequenas e verificáveis.
5. Não implementar todas as plataformas simultaneamente.
6. Não criar telas falsas que aparentem executar funções inexistentes.
7. Não usar dados simulados como se fossem dados reais.
8. Se usar mock, identificá-lo claramente e separar do modo real.
9. Escrever testes para regras de negócio.
10. Executar lint, typecheck e testes após cada etapa relevante.
11. Corrigir erros introduzidos antes de avançar.
12. Documentar comandos de execução e compilação.
13. Registrar decisões arquiteturais importantes.
14. Não armazenar segredos no código-fonte.
15. Não registrar URLs com credenciais.
16. Não ignorar falhas de compilação.
17. Não declarar uma plataforma concluída sem teste correspondente.
18. Preferir dependências mantidas, licenciadas e compatíveis com a distribuição pretendida.
19. Ao encontrar limitação de API ou SDK, documentar e propor alternativa realista.
20. Ao final de cada fase, apresentar arquivos criados/alterados, testes executados, resultados e pendências.

# 17. Prompt principal para iniciar no Codex

Copie o texto abaixo para iniciar o desenvolvimento:

---

Você é o engenheiro de software responsável por implementar o ORANGE Player, um aplicativo multiplataforma de reprodução de mídia IPTV, conforme o Documento Mestre deste projeto.

Seu objetivo é construir software funcional, testável, seguro e modular. Não entregue apenas protótipos visuais.

Comece pela FASE 0.

Primeiro:
1. Inspecione todo o repositório e identifique o estado atual.
2. Identifique linguagens, frameworks, versões, scripts, dependências e ferramentas instaladas.
3. Não apague nem substitua arquivos sem necessidade.
4. Crie `docs/architecture/` e registre as decisões técnicas.
5. Avalie React + TypeScript para a interface compartilhada e a estratégia de integração nativa.
6. Construa uma prova de conceito Android TV com Kotlin + AndroidX Media3, controle remoto D-pad e reprodução de uma mídia de teste legal.
7. Avalie se WebView com bridge nativa atende ao desempenho e ao acesso às APIs necessárias. Se não atender, recomende alternativa e documente.
8. Não comece Tizen, webOS, Windows e Linux antes de validar a arquitetura Android.
9. Apresente um relatório de viabilidade com decisões, riscos e próximos passos.

Depois da FASE 0, avance uma fase por vez, somente quando os critérios de aceite da fase anterior forem cumpridos.

Requisitos obrigatórios:
- Identidade Orange Glass UI.
- Navegação inspirada no Aurora Dashboard do Xbox 360.
- Interface TV-first e controle remoto completo.
- Xtream Codes compatível e importação M3U/M3U8.
- Catálogo de canais, filmes e séries.
- Player nativo por plataforma.
- Áudio, legendas, volume e controles compatíveis com o dispositivo.
- Histórico, favoritos e retomada.
- Temporadas, episódios e marcação de assistidos.
- Banco local SQLite com migrações.
- Segurança de credenciais.
- Testes automatizados e testes em hardware real.

Não invente suporte a codecs, APIs, fabricantes ou recursos. Confirme a disponibilidade na documentação oficial e registre limitações.

Não implemente acesso a conteúdo sem autorização, listas pirateadas ou mecanismos para contornar DRM.

Ao terminar cada fase, informe:
- O que foi implementado.
- Arquivos criados e modificados.
- Como executar.
- Como testar.
- Resultado dos testes.
- Limitações conhecidas.
- Próxima fase proposta.

Comece agora pela inspeção e FASE 0. Não gere todo o projeto em uma única resposta e não avance com funcionalidades não testadas.

---

# 18. Definição de pronto

O ORANGE Player não será considerado concluído apenas porque compila ou porque as telas estão visualmente prontas.

Uma plataforma será considerada entregue somente quando:
- O pacote instalar no dispositivo-alvo.
- A navegação funcionar com os controles reais.
- A autenticação funcionar com uma fonte autorizada.
- O catálogo carregar e atualizar.
- O player reproduzir os formatos documentados.
- O histórico persistir.
- Os erros forem tratados.
- Os testes essenciais passarem.
- A documentação de instalação e uso estiver atualizada.

**Resultado esperado:** uma plataforma de mídia com identidade Orange, navegação cinematográfica inspirada no Aurora, player confiável e arquitetura preparada para expansão multiplataforma.
