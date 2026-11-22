# Sons do jogo

Todos os sons usados pelo jogo estão nesta pasta. O ficheiro [sounds.ts](./sounds.ts) escolhe o som de cada motor e da buzina para Android, iOS e web.

## Usar os teus sons

1. Coloca o ficheiro nesta pasta, por exemplo `meu-jeep.wav`.
2. Abre `sounds.ts` e troca apenas o caminho do som pretendido, por exemplo:
   `jeep: require('./meu-jeep.wav'),`
3. Guarda e reinicia o Expo com `npm start -- --clear`. Para uma versão distribuída, cria uma nova build ou atualização com os novos ficheiros.

Mantém o caminho completo e literal dentro de `require(...)`: o Metro precisa de o conhecer ao construir a aplicação. Mantém as entradas `jeep`, `crawler`, `rally`, `gt3` e `horn`; os nomes dos ficheiros podem ser diferentes. Para maior compatibilidade, usa WAV PCM. Testa os teus ficheiros no navegador e nos dispositivos pretendidos.

Os motores e a buzina são reproduzidos em loop e a velocidade de reprodução altera o tom. Usa gravações que possam repetir sem estalidos; evita silêncio no início ou no fim. A buzina mantém-se ativa enquanto o botão estiver premido e o tom muda conforme a duração. O volume também é ajustado pelo jogo e pela distância.

Os ficheiros originais são loops mono WAV de 16 segundos, sintetizados para o jogo. `npm run audio:generate` **sobrescreve** `engine-jeep.wav`, `engine-crawler.wav`, `engine-rally.wav`, `engine-gt3.wav` e `horn.wav`. Para proteger os teus sons, usa nomes diferentes. `npm run test:audio` também verifica as características dos WAV originais, por isso mantém esses ficheiros mesmo que o catálogo aponte para outros.
