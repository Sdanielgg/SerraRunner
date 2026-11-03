# Serra Runner — Jeep low poly

Cena de condução livre para telemóvel, feita em Expo SDK 58. Inclui uma garagem plana e uma pista de terreno difícil para testar três veículos 3D, sem corridas, missões ou pontuações.

## Abrir

```sh
npm run setup
npm start
```

Depois de clonar, entra na pasta que contém o `package.json` e executa **`npm run setup`**. O comando requer Node.js 22.13+ (recomendado Node 24), instala as dependências exatas do lockfile, verifica TypeScript, compila o servidor multiplayer e exporta a versão web. Funciona em Windows, macOS e Linux. No PowerShell com scripts bloqueados: `npm.cmd run setup`.

Para repetir `setup` num projeto já aberto, termina primeiro o Expo/Metro e os processos locais do projeto com Ctrl+C. No Windows, estes processos podem bloquear ficheiros das dependências durante a reinstalação. Para recompilar sem reinstalar, usa `npm run build`.

Com as dependências já instaladas, **`npm run build`** volta a compilar tudo. O servidor fica em `build-server/` e a versão web em `dist/`. Para executar o servidor local usa `npm run server:start`; para desenvolver o jogo usa `npm start`. O comando não publica no Render nem gera ficheiros de instalação Android/iOS; essas builds usam EAS.

Abre no Expo Go compatível com SDK 58, num emulador ou num development build. A cena usa o contexto OpenGL nativo de `expo-gl`, Three.js e cannon-es. Para abrir no navegador: `npm run web`.

O Three.js e os respetivos tipos estão fixados na versão `0.162.0` para aceitar os contextos `WebGLRenderingContext` expostos por versões nativas do Expo Go. As versões r163 e posteriores rejeitam esses contextos no arranque. Depois de atualizar dependências, reinicia o Metro com `npx expo start --clear` e volta a abrir a aplicação no telemóvel.

Em PowerShell com execução de scripts bloqueada, usa `npm.cmd` e `npx.cmd`.

## Publicar o jogo na Vercel

A versão web está configurada para alojamento estático, com `vercel.json` na pasta do `package.json`. O jogo abre diretamente no navegador dos teus amigos, sem instalar o Expo. A Vercel aloja o jogo e os ficheiros de som; o servidor multiplayer continua no Render, em `https://serrarunner.onrender.com`.

1. Envia as alterações para o teu repositório no GitHub.
2. Na Vercel, escolhe **Add New → Project** e importa o repositório.
3. Em **Root Directory**, escolhe a pasta que contém `package.json` e `vercel.json`. Usa **Framework Preset: Other**. A configuração define a instalação como `npm ci --include=dev`, o build como `npm run web:build` e a pasta de saída como `dist`.
4. Opcionalmente, define `EXPO_PUBLIC_MULTIPLAYER_URL=https://serrarunner.onrender.com` nas variáveis de ambiente. Este já é o endereço usado por defeito.
5. Carrega em **Deploy** e partilha o endereço público de produção que a Vercel gerar.

Para jogarem juntos, abre **Online**, cria uma sala e envia o código aos teus amigos. Eles abrem o mesmo site, entram em **Online** e usam o código. Cada sala aceita quatro jogadores. Mantém o serviço do Render ativo e publica lá também as alterações à física do servidor. O teu computador não precisa de ficar ligado depois de ambos os serviços estarem publicados.

Para verificar a exportação antes de publicar, usa `npm run web:build`: gera `dist/index.html`, as restantes páginas e os assets. As instruções oficiais do [Expo para publicar websites](https://docs.expo.dev/guides/publishing-websites/) descrevem a exportação estática e o alojamento na Vercel.

## Controlos

- Telemóvel: mantém premidos os botões de direção e Acelerar, Recuar ou Travar. Podes acelerar e virar em simultâneo.
- Computador: WASD ou setas; Espaço trava; R repõe o carro.
- Gearing: seleciona **LOW** ou **HIGH** no ecrã; no computador, usa L ou H. Low dá mais força e limita a velocidade a cerca de 32 km/h (14 km/h em marcha-atrás). High é o modo inicial e mantém os limites de 83 e 29 km/h. Podes alternar durante a condução; o jeep desacelera naturalmente se estiver acima do limite de Low. Repor mantém o modo selecionado.
- Câmara: alterna entre vista de três quartos, traseira e **Livre** (tecla C no computador). Em Livre, arrasta numa zona livre do ecrã com o dedo ou rato para orbitar à volta do jeep. A orientação mantém-se quando o carro vira; podes continuar a usar os pedais com outros dedos. A altura da câmara acompanha o relevo.
- **Testar terreno** (tecla T): coloca o jeep na entrada da pista e seleciona Low. Segue as bandeiras: rampa de 4 m, lombas desencontradas para testar a articulação da suspensão e subida de 7 m com inclinação lateral. Também podes conduzir até à pista, à esquerda da garagem. O relevo visual e as colisões usam a mesma grelha de alturas.
- Repor: recoloca o jeep na posição inicial, incluindo se capotar.
- Som: o botão **Som: ligado/desligado** ativa ou silencia os motores. O som começa depois da primeira interação com o jogo.

## Sons dos veículos

Cada veículo tem um motor sintetizado diferente: o Crawler tem um som mais grave e o Rally mais agudo. A rotação e o volume acompanham a velocidade, aceleração, travagem e modo Low/High. No multiplayer, os motores dos outros jogadores ficam mais baixos à medida que se afastam e deixam de tocar a partir de 60 metros. Ao perder o foco, abrir menus ou silenciar o som, o volume desce com um fade antes de pausar; ao regressar, sobe gradualmente. O fade do misturador dura cerca de 250 ms e pode inverter o sentido sem reiniciar o motor. Os comandos são libertados ao perder o foco.

Os loops WAV são locais e originais, gerados por `scripts/generate-engine-audio.cjs`; não dependem de serviços de som externos. Cada loop tem 16 segundos e é guardado na cache do dispositivo antes de tocar, incluindo ao trocar de veículo. A reprodução mantém-se contínua nas transições do loop e evita reconfigurar a rotação com alterações mínimas. No multiplayer, cada leitor de áudio acompanha o mesmo carro, mesmo quando a ordem dos carros por distância muda. Para regenerar os sons: `npm run audio:generate`. A reprodução usa `expo-audio`, incluído no Expo Go compatível com o SDK 58, sem pedir acesso ao microfone. Depois de atualizar as dependências, reinicia o Expo com `npm start -- --clear`.

No navegador, o som usa Web Audio com os ficheiros descodificados em memória. A rotação e o volume mudam por rampas no relógio do áudio, e o mesmo loop mantém a sua fase ao silenciar e retomar. Em iOS/Android, a reprodução usa `expo-audio` e os ficheiros em cache.

## Veículos

Abre **Veículos** (tecla V no computador) para comparar os modelos. **Testar na pista** coloca o modelo escolhido na mesma entrada do percurso, em Low; **Testar no plano** coloca-o na garagem em High. A simulação fica em pausa enquanto o seletor está aberto. Podes voltar ao seletor e trocar de veículo a qualquer momento; a câmara mantém o modo escolhido e os comandos anteriores são libertados.

| Modelo | Altura ao solo aproximada | Máxima em High | Vantagens e limitações |
| --- | --- | --- | --- |
| Serra 4×4 | 54 cm | 83 km/h | Equilíbrio entre velocidade e capacidade no terreno. |
| Rocha Crawler | 86 cm | 58 km/h | Rodas maiores e suspensão de maior curso; mais pesado e lento, exige cuidado nas inclinações laterais. |
| Vale Rally | 32 cm | 122 km/h | Mais leve, baixo e rápido; raspa com mais facilidade e tem menos curso de suspensão nas lombas. |

As alturas são estimadas em repouso, em plano. Cada modelo tem geometria, massa, dimensões de colisão, raio das rodas, aderência, suspensão e relações Low/High próprios. O Crawler tem bagageira de tejadilho, snorkel e proteções; o Rally tem carroçaria baixa, faixa clara e aileron. Os travões suaves adaptam a força à massa de cada veículo.

## Multiplayer

Abre **Online** (tecla M no computador), indica o servidor e cria uma sala ou entra com um código. Até quatro jogadores partilham o terreno, com física e colisões calculadas num servidor Node.js/Colyseus. O modo individual continua disponível. **Sair da sala** volta ao modo individual.

O servidor está pronto para alojamento público com `render.yaml`; ainda é necessário publicá-lo numa conta de alojamento e introduzir o endereço real no jogo. Segue [as instruções de publicação e teste](server/README.md). Para testar no computador: `npm run server:dev` e usa `http://localhost:2567` no menu Online. Para redes diferentes, usa a URL HTTPS/WSS do serviço publicado.

Ecrã fixado na horizontal em mobile. Os controlos seguem cada dedo separadamente: podes acelerar, virar ou travar em simultâneo, e levantar um dedo mantém os restantes comandos ativos. Ao sair da aplicação ou perder o foco no navegador, os comandos são libertados.

## Física e modelo

Jeep construído com geometria low poly: carroçaria, portas, janelas, espelhos, faróis, grelha, para-choques, quatro rodas e pneu suplente. Os materiais são locais e não requerem descarregamentos de modelos ou texturas.

Física com gravidade, colisão com o chão, chassis de 700 kg, tração nas quatro rodas, suspensão independente por raycast, aderência dos pneus, direção suavizada e travagem antes de inverter o sentido. Velocidade aproximada máxima: 83 km/h para a frente e 29 km/h em marcha-atrás. A câmara segue o veículo com suavização. Ao atingir o limite da área (240 m), o jeep regressa ao início.

O contacto da suspensão considera o contorno e a largura dos pneus para detetar lombas e o lado mais alto das inclinações. Colisores nos pneus, colocados no limite de compressão da suspensão, apoiam o carro quando tomba de lado e impedem que a suspensão comprima além do seu curso. Estes colisores não acrescentam atrito à aderência já calculada pelas rodas. O chassis tem a parte inferior chanfrada junto dos para-choques e baixo atrito contra o terreno para raspar e deslizar nas lombas. As rodas desenhadas acompanham o terreno depois da interpolação, tanto no modo individual como online. Alterações à física partilhada exigem voltar a publicar o servidor no Render.

## Código

- `src/game/jeep.ts`: modelo e materiais.
- `src/game/vehicles.ts`: características e afinação dos três veículos.
- `src/game/physics.ts`: física, suspensão e comandos.
- `src/game/chassis-shape.ts`: colisor do chassis com extremidades inferiores chanfradas.
- `src/game/terrain-vehicle.ts`: contactos dos pneus com largura e contorno.
- `src/game/wheel-terrain.ts`: ajuste visual das rodas ao terreno após interpolação.
- `src/game/terrain.ts`: grelha do relevo partilhada pelo desenho e pelas colisões.
- `src/game/orbit-camera.ts`: arrasto, orientação e limites da câmara livre.
- `src/game/scene.ts`: chão, luz, sombras, câmara e renderização.
- `src/components/driving-scene.tsx`: ecrã e controlos táteis/teclado.
- `src/components/vehicle-garage.tsx`: comparação e escolha dos veículos para teste.

## Verificação

```sh
npm run lint
npm run typecheck
npm run test:physics
npm run test:audio
npx expo export --platform web
```

O lint usa diretamente ESLint com a configuração oficial do Expo, porque o comando `expo lint` deste SDK falha ao detetar a instalação local do ESLint neste ambiente.
