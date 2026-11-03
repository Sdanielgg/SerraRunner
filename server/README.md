# Multiplayer pela Internet

O servidor Node.js/Colyseus gere salas privadas por código, até quatro jogadores por sala, um mundo de cannon-es por sala e colisões entre veículos. Corre a física a 60 Hz e envia snapshots a 20 Hz. O cliente apresenta os veículos com um pequeno buffer de interpolação (80 ms), incluindo as rodas e a suspensão.

## Publicar no Render

1. Coloca este projeto num repositório Git acessível à tua conta Render, incluindo `package-lock.json` e `render.yaml`.
2. No Render, cria um **Blueprint**, liga o repositório e seleciona `render.yaml`. Se esta pasta estiver dentro de outra pasta no repositório, configura a localização do Blueprint/Root Directory em conformidade.
3. Revê o serviço `serra-runner-multiplayer` e cria-o. O exemplo usa o plano Free e uma única instância em Frankfurt.
4. Espera pelo fim do deploy e abre `https://NOME-DO-SERVIDOR.onrender.com/health`. Deverá responder com `{"game":"Serra Runner","version":1,"status":"ok"}`.
5. Abre **Online** no jogo e introduz o endereço base `https://NOME-DO-SERVIDOR.onrender.com`, sem `/health`. Também aceita `wss://NOME-DO-SERVIDOR.onrender.com`.
6. Um jogador carrega em **Criar sala** e partilha o código de oito caracteres. Os outros usam o mesmo endereço e **Entrar na sala**. Podem estar em redes Wi-Fi diferentes ou em dados móveis.

Alternativa sem Blueprint: cria um **Web Service** Node com este diretório como Root Directory, Build Command `npm ci --include=dev && npm run server:build`, Start Command `npm run server:start` e Health Check Path `/health`. O processo lê a porta de `PORT` e escuta em `0.0.0.0`. Não precisas de Redis para esta configuração de uma única instância.

O plano Free pode suspender o serviço quando está inativo. No primeiro acesso, espera que `/health` responda e volta a tentar entrar se o jogo apresentar timeout. Para sessões regulares, considera uma instância que permaneça ativa. Confirma as condições e os preços atuais na tua conta antes de escolher outro plano.

## Configurar o endereço por defeito

O menu Online usa `https://serrarunner.onrender.com` por defeito. O campo Servidor Online permite trocar o endereço sem recompilar. Para configurar outro endereço por defeito, copia `.env.example` para `.env.local`, troca o endereço pelo teu e reinicia o Expo. Em builds distribuídas, define `EXPO_PUBLIC_MULTIPLAYER_URL` durante o build. Esta variável é pública e não deve conter credenciais.

O jogo também tem de estar disponível para os teus amigos: podes distribuir uma build mobile ou alojar a versão web. O servidor multiplayer e o servidor de desenvolvimento Expo são serviços diferentes; o endereço da sala deve apontar para o servidor Node, não para o Metro.

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

Abre duas instâncias web do jogo. Em **Online**, usa `http://localhost:2567`, cria uma sala numa instância e entra com o código na outra. Num telemóvel, `localhost` aponta para o próprio telemóvel; para o teste remoto usa o servidor publicado. URLs públicas têm de usar HTTPS/WSS.

## Comportamento

- Cada jogador entra com o veículo selecionado. **Veículos** permite trocar de modelo e escolher entre o plano e a pista, com uma posição inicial diferente para cada jogador.
- **Circuito** leva cada jogador à sua posição na grelha do Circuito da Serra, em High. Os quatro lugares são separados e as barreiras usam o mesmo traçado no servidor e no jogo. A versão do protocolo é 2: publica o servidor e o site atualizados para usarem o mesmo mapa.
- Os comandos e Low/High são enviados ao servidor; os clientes não escolhem a sua posição. A força dos travões, limites de velocidade e terreno são os mesmos do modo individual.
- Ao abrir um menu ou colocar a aplicação em segundo plano, os comandos desse jogador são libertados. A sala continua a simular para os restantes jogadores.
- Após uma quebra de rede, o cliente tenta voltar automaticamente à mesma sessão. O servidor reserva o lugar por 15 segundos. Se não recuperar, podes voltar a entrar manualmente com o código enquanto a sala existir.
- **Sair da sala** regressa ao modo individual. As salas desaparecem quando ficam vazias e não persistem após reiniciar o servidor.
- Esta primeira versão usa interpolação, sem previsão local dos comandos. A resposta da direção depende da latência da ligação; escolhe uma região próxima dos jogadores.
- O código funciona como convite, sem contas ou autenticação persistente. Esta configuração limita cada processo a 32 salas e cada sala a quatro jogadores; não é uma configuração de escala automática.

## Verificação

```sh
npm run test:multiplayer
npm run test:physics
npm run typecheck
npm run lint
```

O teste multiplayer abre um servidor numa porta temporária e liga clientes reais por WebSocket. Verifica quatro jogadores, limite da sala, códigos, isolamento entre salas, movimento calculado no servidor, libertação de comandos, troca de veículos, reconexão e saída. O teste de física inclui colisões, modelos e renderização de veículos remotos com um renderer simulado.

`metro.config.js` seleciona o bundle oficial para navegador do SDK Colyseus 0.16 em Android/iOS, que usa os globais WebSocket/XMLHttpRequest do React Native. No servidor Node mantém-se o SDK normal. Depois de instalar ou alterar dependências, reinicia o Expo com `npx expo start --clear`.

Referências: [Colyseus](https://docs.colyseus.io/), [WebSockets no Render](https://render.com/docs/websocket), [Blueprints do Render](https://render.com/docs/blueprint-spec), [plano Free](https://render.com/docs/free).
