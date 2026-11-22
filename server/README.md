# Ramp Rivals — Multiplayer pela Internet

O servidor Node.js/Colyseus gere salas privadas por código, até quatro jogadores por sala, um mundo de cannon-es por sala e colisões entre veículos. Corre a física a **60 Hz** e envia snapshots a **20 Hz**, confirmados no teste de rede. O carro local usa predição/reconciliação com ACK e estado de física; os adversários mantêm o buffer de interpolação de 80 ms, incluindo as rodas e a suspensão. O lobby e as rondas estão descritos em [competição multiplayer](../docs/multiplayer-competition.md).

As salas exigem uma conta Supabase. Antes de publicar ou testar, aplica as migrações e configura `server/.env.local` ou as variáveis do alojamento segundo [docs/supabase-setup.md](../docs/supabase-setup.md). O servidor verifica tokens com Supabase Auth e nunca confia num `userId` enviado pelo cliente. A chave secreta só existe no servidor. Sem chave secreta, as competições com persistência ficam indisponíveis.

## Publicar no Render

1. Coloca este projeto num repositório Git acessível à tua conta Render, incluindo `package-lock.json` e `render.yaml`.
2. No Render, cria um **Blueprint**, liga o repositório e seleciona `render.yaml`. Se esta pasta estiver dentro de outra pasta no repositório, configura a localização do Blueprint/Root Directory em conformidade.
3. Revê o serviço `serra-runner-multiplayer` e cria-o. O exemplo usa o plano Free e uma única instância em Frankfurt.
4. Espera pelo fim do deploy e abre `https://NOME-DO-SERVIDOR.onrender.com/health`. Deverá responder com `{"game":"Ramp Rivals","version":10,"status":"ok"}` (versão atual do protocolo). Este endpoint confirma o processo, não as credenciais ou migrações Supabase.
5. Abre **Online** no jogo e introduz o endereço base `https://NOME-DO-SERVIDOR.onrender.com`, sem `/health`. Também aceita `wss://NOME-DO-SERVIDOR.onrender.com`.
6. Um jogador carrega em **Criar sala** e partilha o código de oito caracteres. Os outros usam o mesmo endereço e **Entrar na sala**. Podem estar em redes Wi-Fi diferentes ou em dados móveis.

Alternativa sem Blueprint: cria um **Web Service** Node com este diretório como Root Directory, Build Command `npm ci --include=dev && npm run server:build`, Start Command `npm run server:start` e Health Check Path `/health`. O processo lê a porta de `PORT` e escuta em `0.0.0.0`. Não precisas de Redis para esta configuração de uma única instância.

O plano Free pode suspender o serviço quando está inativo. No primeiro acesso, espera que `/health` responda e volta a tentar entrar se o jogo apresentar timeout. Para sessões regulares, considera uma instância que permaneça ativa. Confirma as condições e os preços atuais na tua conta antes de escolher outro plano.

## Configurar o endereço por defeito

O menu Online usa `https://serrarunner.onrender.com` por defeito. O campo Servidor Online permite trocar o endereço sem recompilar. Para configurar outro endereço por defeito, copia `.env.example` para `.env.local`, troca o endereço pelo teu e reinicia o Expo. Em builds distribuídas, define `EXPO_PUBLIC_MULTIPLAYER_URL` durante o build. Esta variável é pública e não deve conter credenciais.

O jogo também tem de estar disponível para os teus amigos: podem abrir o projeto no Expo Go físico compatível com SDK 58 ou usar a versão web alojada. O servidor multiplayer e o servidor de desenvolvimento Expo são serviços diferentes; o endereço da sala deve apontar para o servidor Node, não para o Metro.

## Testar no computador

Requer Node 22.13+ (testado com Node 24).

```sh
npm run setup
npm run server:dev
```

`npm run setup` prepara todo o projeto após o clone: instala as dependências do lockfile, verifica TypeScript e compila servidor + web. Para compilar novamente sem reinstalar usa `npm run build`. No Render, mantém o comando de build específico do servidor (`npm ci --include=dev && npm run server:build`), porque o serviço multiplayer não precisa de gerar a versão web.

Noutro terminal:

```sh
npm start
```

Abre duas instâncias web do jogo com duas contas reais autenticadas. Em **Online**, usa `http://localhost:2567`, cria uma sala numa instância e entra com o código na outra. Num telemóvel, `localhost` aponta para o próprio telemóvel; para o teste remoto usa o servidor publicado. URLs públicas têm de usar HTTPS/WSS.

## Comportamento

- Cada jogador entra com o veículo selecionado. **Veículos** permite trocar de modelo e escolher entre o plano e a pista, com uma posição inicial diferente para cada jogador.
- **Circuito** leva cada jogador à sua posição na grelha do Circuito da Serra, em High. Os quatro lugares são separados e as barreiras usam o mesmo traçado no servidor e no jogo. A versão do protocolo é 10: publica o servidor e o site atualizados para usarem o mesmo mapa, dimensões do Serra GT3, buzinas, garagem e economia sincronizadas.
- Cada clique na buzina envia um toque curto com tom aleatório, sincronizado nos snapshots. Os clientes calculam o volume pela distância (até 80 m); o servidor desliga a buzina ao repor/trocar o veículo, perder a ligação ou deixar de receber comandos durante 500 ms.
- Os comandos e Low/High são enviados ao servidor; os clientes não escolhem a sua posição. A força dos travões, limites de velocidade e terreno são os mesmos do modo individual.
- Ao abrir um menu ou colocar a aplicação em segundo plano, os comandos desse jogador são libertados. A sala continua a simular para os restantes jogadores.
- Após uma quebra de rede, a reserva dura 30 segundos (`RECONNECT_WINDOW_SECONDS`, configurável até 300). A API Colyseus 0.16 e o token Supabase da mesma conta retomam a mesma sessão, validada antes de consumir a reserva. Código de convite não recupera identidade. O carro continua físico com travão e sem comandos/buzina; estado e operações idempotentes conservam-se. Expiração remove o carro e transfere anfitrião. Sem restauro após reinício do processo. Regras completas: [reconexão](../docs/multiplayer-competition.md#entradas-anfitrião-e-reconexões).
- **Sair da sala** regressa ao modo individual. As salas desaparecem quando ficam vazias e não persistem após reiniciar o servidor.
- Comandos são produzidos em passos de 60 Hz e enviados em lotes a 30 Hz. O servidor valida sequências e só aplica um comando por passo; snapshots incluem confirmação e estado para restaurar/repetir os comandos pendentes do cliente. Colisões definitivas continuam exclusivamente na física partilhada da sala.
- O código funciona como convite e a identidade é validada pelo Supabase Auth. Esta configuração limita cada processo a 32 salas e cada sala a quatro jogadores; não é uma configuração de escala automática.
- A competição por rondas exige 2–4 jogadores prontos e anfitrião. Após o início, `lock()` e validações bloqueiam novas ligações, permitindo reconexões válidas. Cada vitória vale 1 ponto; objetivo normal 15 e demo 3. Sem chegada válida, nenhum ponto. O Desafio da Serra e os seus 30 checkpoints não mudam.
- A economia é autoritativa. `settle_competition_round` confirma resultados, pontos, recompensas, saldo, movimentos e estatísticas numa única transação. Aplicar as quatro migrações, incluindo `20261113000400_garage_persistence.sql`. Créditos ficam a guardar até fechar a ronda; a fila não confirmada continua em memória.
- Compras na garagem usam UUID emitido pelo servidor e `purchase_vehicle_upgrade`: participação/fase, catálogo, nível e saldo validados, locks e débito/nível atómicos. Níveis confirmados só equipam a próxima ronda; saldo global existente preservado e melhorias por participante/competição/veículo. Estado/resultados anteriores preservados. [Garagem e persistência](../docs/garage-persistence.md).

## Verificação

```sh
npm run test:multiplayer
npm run test:physics
npm run test:auth
npm run test:database
npm run test:competition
npm run test:tournament
npm run test:tournament:online
npm run test:prediction
npm run typecheck
npm run lint
```

O teste multiplayer abre um servidor numa porta temporária e liga clientes reais por WebSocket. Verifica quatro jogadores, limite da sala, códigos, isolamento entre salas, movimento calculado no servidor, libertação de comandos, troca de veículos, reconexão e saída. O teste de física inclui colisões, modelos e renderização de veículos remotos com um renderer simulado.

`metro.config.js` seleciona o bundle oficial para navegador do SDK Colyseus 0.16 em Android/iOS, que usa os globais WebSocket/XMLHttpRequest do React Native. No servidor Node mantém-se o SDK normal. Depois de instalar ou alterar dependências, reinicia o Expo com `npx expo start --clear`.

Referências: [Colyseus](https://docs.colyseus.io/), [WebSockets no Render](https://render.com/docs/websocket), [Blueprints do Render](https://render.com/docs/blueprint-spec), [plano Free](https://render.com/docs/free).
