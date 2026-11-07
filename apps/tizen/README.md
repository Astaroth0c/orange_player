# Samsung Tizen TV

O modelo Samsung LS43F6000FG usa Tizen. Instale Tizen Studio com Web CLI, Samsung TV Extension e Samsung Certificate Extension. No Certificate Manager, crie um perfil Samsung TV usando sua Samsung Developer Account, um author certificate e um distributor certificate associado ao DUID desta TV. O DUID está nas informações de suporte da TV.

Depois, abra um PowerShell nesta pasta e execute `./package.ps1 -CertificateProfile "NOME_DO_PERFIL"` (ou defina `TIZEN_CERTIFICATE_PROFILE`). Isso prepara a UI, usa AVPlay e cria/assina o WGT sem expor a chave privada. Samsung exige WGT assinado com um perfil válido para instalação em TVs.

Reprodução AVPlay é fornecida por `tv-bridge.js`; a importação Xtream/M3U ainda exige CORS liberado pelo servidor da fonte.
