# Samsung Tizen TV

O pacote WGT é montado no Tizen Studio com o perfil Samsung TV. Copie o build web para esta pasta como `index.html` e `assets/` antes de empacotar. O Tizen Studio/Certificate Manager e certificado de desenvolvedor da TV são requisitos para assinatura e instalação.

O navegador Tizen fornece reprodução HLS via HTMLMediaElement. Para fontes que não liberam CORS, a conexão Xtream/M3U precisa de uma origem de rede autorizada com CORS ou um adaptador AVPlay nativo; o navegador web não pode contornar a política de origem.
