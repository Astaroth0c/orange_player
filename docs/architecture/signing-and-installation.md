# Assinatura e instalação

| Plataforma | Entrega atual | Para assinar/distribuir |
| --- | --- | --- |
| Windows | Instalador NSIS `.exe`, instalável sem certificado | Certificado de assinatura de código OV/EV no nome do publicador. `electron-builder` lê `CSC_LINK` e `CSC_KEY_PASSWORD`; configurar no ambiente ou nos Secrets do CI. Sem assinatura, o Windows pode mostrar o alerta SmartScreen. |
| Linux | AppImage e DEB no artefato do workflow Ubuntu | Nenhum certificado é necessário para instalar o arquivo baixado. Para distribuição por repositório, assinar o repositório APT com chave GPG. |
| Android TV | APK de depuração, assinado com a chave debug local | Para publicar ou distribuir atualizações estáveis, criar e guardar um keystore de release, com alias e senhas. Nunca substituir a chave entre versões. Definir `ORANGE_STORE_FILE`, `ORANGE_STORE_PASSWORD`, `ORANGE_KEY_ALIAS` e `ORANGE_KEY_PASSWORD` no ambiente local seguro. |
| LG webOS TV | IPK para Developer Mode sideload | Instalar o Developer Mode na TV, entrar com conta LG Developer e registrar a TV no webOS CLI com IP/porta/chave exibidos pela app. A loja exige o processo de submissão do Seller Lounge. |
| Samsung Tizen TV | Projeto preparado; WGT ainda não gerado | Tizen Studio, Samsung TV Extension, Certificate Extension, conta Samsung Developer, TV em Developer Mode e DUID. Criar no Certificate Manager um perfil com author certificate e distributor certificate ligado ao DUID da TV; assinar o WGT com esse perfil. Guarde o author keystore: ele identifica as atualizações futuras. |

Não envie keystore, arquivos `.p12`, senhas, chaves privadas ou certificados de assinatura pela conversa. Os segredos devem ficar no computador de publicação ou nos Secrets privados do repositório. Compartilhe somente DUID e dados públicos de certificado quando necessários.
