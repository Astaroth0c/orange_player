# Samsung Tizen TV

Execute `npm --prefix ../web run build` e `node prepare-assets.cjs` nesta pasta para preparar a UI e a ponte AVPlay. O pacote WGT é montado no Tizen Studio com o perfil Samsung TV. O Tizen Studio/Certificate Manager e certificado de desenvolvedor da TV são requisitos para assinatura e instalação.

Reprodução AVPlay é fornecida por `tv-bridge.js`; a importação Xtream/M3U ainda exige CORS liberado pelo servidor da fonte.
