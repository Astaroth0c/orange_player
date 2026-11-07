# Samsung Tizen TV

O modelo Samsung LS43F6000FG usa Tizen. O Tizen Studio já está instalado em `C:\tizen-studio`; o CLI foi localizado, mas ainda não há perfil de assinatura registrado no CLI. No Package Manager, confirme que **Web CLI**, **Samsung TV Extension** e **Samsung Certificate Extension** estão instaladas. No Certificate Manager, crie um perfil **Samsung → TV**, entre na Samsung Developer Account e gere author + distributor certificates. Adicione o DUID em **Menu → Support → Contact Samsung → Unique Device ID**.

Depois, abra um PowerShell nesta pasta e execute `./package.ps1 -CertificateProfile "NOME_DO_PERFIL"` (ou defina `TIZEN_CERTIFICATE_PROFILE`). O script procura o CLI em `C:\tizen-studio`, prepara a UI/AVPlay e cria/assina o WGT usando o perfil local; a chave privada não sai do computador. Samsung exige WGT assinado com um perfil válido para instalar na TV.

Reprodução AVPlay é fornecida por `tv-bridge.js`; a importação Xtream/M3U ainda exige CORS liberado pelo servidor da fonte.
