# LG webOS TV

Gere o build web com `npm --prefix ../web run build`, execute `node prepare-assets.cjs` nesta pasta e empacote com `ares-package`. Instalação na TV usa `ares-install` e Developer Mode. Esses comandos precisam do webOS TV SDK/CLI instalado e do dispositivo configurado.

O app usa HTMLMediaElement; HLS depende da versão do webOS e dos codecs aceitos pelo aparelho. As fontes precisam permitir acesso CORS ao endpoint do player para Xtream e M3U via navegador.
