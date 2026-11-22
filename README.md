# Ramp Rivals — Jeep low poly

Jogo de condução para telemóvel e navegador, feito em Expo SDK 58. Inclui uma garagem plana, uma pista de terreno difícil e um circuito de corridas para testar quatro veículos 3D, a solo ou com amigos.

O estado confirmado das funcionalidades, versões instaladas e próximos passos está em [docs/implementation-plan.md](docs/implementation-plan.md). O nome apresentado é **Ramp Rivals**; os identificadores técnicos existentes, os nomes dos veículos e **Desafio da Serra** são preservados. A autenticação, os perfis e os resultados de competição usam Supabase: segue [as instruções de configuração](docs/supabase-setup.md) para aplicar a migração e configurar cliente/servidor. Sem credenciais, a condução livre e o desafio local continuam disponíveis; a validação contra um projeto Supabase real está pendente.

No menu principal, abre a **Garagem** para escolher o carro. Seleciona um **Percurso** e prime **Jogar**. Podes visitar as definições ou o perfil antes de carregar a pista. Para multiplayer, abre **Lobby** e cria uma sala ou introduz o código de convite. Durante a condução, **Menu → Sair para o menu principal** fecha a cena.

## Preparar uma demonstração com dois telemóveis

1. No projeto Supabase de teste, ativa Email/Password e configura o envio de email. Se a confirmação estiver ativa, inclui `{{ .Token }}` no template **Confirm signup** para introduzir o código na aplicação.
2. Aplica os ficheiros de `supabase/migrations/` por ordem de timestamp. No SQL Editor, executa uma vez cada migração pendente: `20261113000100_profiles_and_results.sql`, `20261113000200_multiplayer_rounds.sql`, `20261113000300_race_economy.sql` e `20261113000400_garage_persistence.sql`. Com a CLI ligada ao projeto correto, podes usar `supabase db push`.
3. Copia `.env.example` para `.env.local`. Preenche `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `EXPO_PUBLIC_MULTIPLAYER_URL`. Para uma demonstração na rede local, usa o IPv4 do computador, por exemplo `http://192.168.1.20:2567`.
4. Copia `server/.env.example` para `server/.env.local`. Define `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do mesmo projeto. Guarda `SUPABASE_SECRET_KEY` exclusivamente neste ficheiro do servidor, ignorado pelo Git. Os valores iniciais são `PORT=2567` e `RECONNECT_WINDOW_SECONDS=30`.
5. Com Node 22.13+ e dependências instaladas (`npm ci`), executa `npm run server:dev` num terminal e `npx expo start --lan --go` noutro. Liga os dois telemóveis à mesma rede Wi-Fi do computador. Confirma que ambos conseguem abrir `http://<IPv4-do-computador>:2567/health` e lê o QR do Metro com Expo Go compatível com SDK 58. Permite o acesso aos portos do servidor e do Metro na rede privada. Para usar um navegador como segundo jogador, prime **w** no Metro. Reinicia os processos depois de mudar variáveis.
6. No perfil do menu principal, usa uma conta diferente por jogador. Confirma o email se solicitado e escolhe nome e cor. Seleciona o carro e abre **Lobby**. O anfitrião cria a sala e o segundo jogador introduz o código no mesmo servidor. Cada jogador marca **Estou pronto**. O anfitrião escolhe **Demo · 3 pontos** antes de iniciar.
7. Segue os checkpoints por ordem e cruza a meta. Passa sobre moedas e combustível. Na rampa, roda no ar com Q/E ou os botões de pirueta e aterra de forma estável. Observa no HUD o prémio pendente, o depósito e o saldo confirmado. Em **Resultados**, compara o tempo, o ponto do vencedor e as moedas guardadas. Uma ronda sem chegada válida termina sem ponto.
8. Na garagem entre rondas, compra uma melhoria com saldo suficiente. Marca **Estou pronto** e inicia a ronda seguinte para a experimentar. Repete até um jogador somar três vitórias. Em **Normal**, são necessárias 15 vitórias. No fim, consulta as rondas e movimentos no perfil.

O guia de configuração detalha as permissões, a confirmação de email e as falhas de persistência. [Configuração Supabase](docs/supabase-setup.md)

## Abrir

```sh
npm run setup
npm start
```

Depois de clonar, entra na pasta que contém o `package.json` e executa **`npm run setup`**. O comando requer Node.js 22.13+ (recomendado Node 24), instala as dependências exatas do lockfile, verifica TypeScript, compila o servidor multiplayer e exporta a versão web. Funciona em Windows, macOS e Linux. No PowerShell com scripts bloqueados: `npm.cmd run setup`.

Para repetir `setup` num projeto já aberto, termina primeiro o Expo/Metro e os processos locais do projeto com Ctrl+C. No Windows, estes processos podem bloquear ficheiros das dependências durante a reinstalação. Para recompilar sem reinstalar, usa `npm run build`.

Com as dependências já instaladas, **`npm run build`** volta a compilar tudo. O servidor fica em `build-server/` e a versão web em `dist/`. Para executar o servidor local usa `npm run server:start`; para desenvolver o jogo usa `npm start`. O comando não publica no Render nem gera ficheiros de instalação Android/iOS.

Abre no Expo Go físico compatível com SDK 58 ou num emulador com Expo Go. A cena usa o contexto OpenGL nativo de `expo-gl`, Three.js e cannon-es. Para abrir no navegador: `npm run web`. O desenvolvimento mantém Expo Go e web, sem eject, prebuild ou development builds.

O Three.js e os respetivos tipos estão fixados na versão `0.162.0` para aceitar os contextos `WebGLRenderingContext` expostos por versões nativas do Expo Go. As versões r163 e posteriores rejeitam esses contextos no arranque. Depois de atualizar dependências, reinicia o Metro com `npx expo start --clear` e volta a abrir a aplicação no telemóvel.

Em PowerShell com execução de scripts bloqueada, usa `npm.cmd` e `npx.cmd`.

## Publicar o jogo na Vercel

A versão web está configurada para alojamento estático, com `vercel.json` na pasta do `package.json`. O jogo abre diretamente no navegador dos teus amigos, sem instalar o Expo. A Vercel aloja o jogo e os ficheiros de som; o servidor multiplayer continua no Render, em `https://serrarunner.onrender.com`.

1. Envia as alterações para o teu repositório no GitHub.
2. Na Vercel, escolhe **Add New → Project** e importa o repositório.
3. Em **Root Directory**, escolhe a pasta que contém `package.json` e `vercel.json`. Usa **Framework Preset: Other**. A configuração define a instalação como `npm ci --include=dev`, o build como `npm run web:build` e a pasta de saída como `dist`.
4. Opcionalmente, define `EXPO_PUBLIC_MULTIPLAYER_URL=https://serrarunner.onrender.com` nas variáveis de ambiente. Este já é o endereço usado por defeito.
5. Carrega em **Deploy** e partilha o endereço público de produção que a Vercel gerar.

Para jogarem juntos, inicia sessão em **Menu → Entrar / Registar**, abre **Menu → Online**, cria uma sala e envia o código aos teus amigos. Eles entram nas suas contas, abrem **Online** e usam o código. Cada sala aceita quatro jogadores. Mantém o serviço do Render ativo e publica cliente e servidor com protocolo 10 e o mesmo projeto Supabase. O teu computador não precisa de ficar ligado depois de ambos os serviços estarem publicados.

Para verificar a exportação antes de publicar, usa `npm run web:build`: gera `dist/index.html`, as restantes páginas e os assets. As instruções oficiais do [Expo para publicar websites](https://docs.expo.dev/guides/publishing-websites/) descrevem a exportação estática e o alojamento na Vercel.

## Controlos

- Telemóvel: mantém premidos os botões de direção e Acelerar, Recuar ou Travar. Podes acelerar e virar em simultâneo.
- Computador: WASD ou setas; Espaço trava; R repõe o carro.
- **Jogar nível** (tecla N): abre a escolha de veículo para o **Desafio da Serra** a solo. Podes usar qualquer um dos quatro carros, incluindo o GT3. Depois de 3 segundos de contagem decrescente, completa uma volta de aproximadamente 846 m com 30 checkpoints: reta de lançamento, chicane, túnel de 24 m, ponte estreita elevada, curva norte, lombas, slalom de cinco obstáculos, duas rampas e curva final. Arcos e setas indicam a sequência; o cronómetro e distância ao próximo checkpoint ficam no ecrã. **Recuperar +5 s** (R), sempre visível, regressa ao último checkpoint. Na meta, podes repetir, trocar de carro ou regressar à condução livre. Os melhores tempos da sessão são separados por veículo. **Menu → Escolher carro para o desafio** abre o seletor; fechar sem iniciar retoma a tentativa. Seletores/perda de foco conservam a pausa existente; o menu de condução mantém o cronómetro a decorrer e avisa disso. O modo cronometrado só está disponível fora de uma sala online.
- **Buzina**: clica no botão **Buzina** ou carrega uma vez na tecla **B**. Cada clique dá um toque curto com um tom aleatório (grave, médio ou agudo), diferente do anterior. Podes clicar várias vezes seguidas para criar uma sequência de sons.
- Transmissão definida automaticamente pelo percurso escolhido: mais força no todo-o-terreno, relação normal no plano/circuito e nos modos cronometrados. Sem botões de mudanças ou atalhos L/H. O velocímetro e a marcha-atrás mantêm-se.
- Câmara: alterna entre vista de três quartos, traseira e **Livre** (tecla C no computador). Em Livre, arrasta numa zona livre do ecrã com o dedo ou rato para orbitar à volta do jeep. A orientação mantém-se quando o carro vira; podes continuar a usar os pedais com outros dedos. A altura da câmara acompanha o relevo.
- **Testar terreno** (tecla T): coloca o jeep na entrada da pista e seleciona Low. Segue as bandeiras: rampa de 4 m, lombas desencontradas para testar a articulação da suspensão e subida de 7 m com inclinação lateral. Também podes conduzir até à pista, à esquerda da garagem. O relevo visual e as colisões usam a mesma grelha de alturas.
- **Circuito** (tecla P): entra no Circuito da Serra em High. Percurso fechado de aproximadamente 400 m, com asfalto de 12 m de largura, reta de partida, curvas rápidas, zona em S, pianos vermelhos/brancos, setas de direção e barreiras com colisão. A grelha tem quatro lugares, usados também no multiplayer. No circuito, **Repor** (R) regressa à grelha. A ligação por estrada à direita da garagem permite entrar a conduzir.
- Repor: recoloca o jeep na posição inicial, incluindo se capotar.
- Som: o botão **Som: ligado/desligado** ativa ou silencia os motores e as buzinas. O som começa depois da primeira interação com o jogo.

## Sons dos veículos

Cada veículo tem um motor sintetizado diferente: o Crawler tem um som mais grave e o Rally mais agudo. A rotação e o volume acompanham a velocidade, aceleração, travagem e modo Low/High. No multiplayer, os motores dos outros jogadores ficam mais baixos à medida que se afastam e deixam de tocar a partir de 60 metros. Ao perder o foco, abrir menus ou silenciar o som, o volume desce com um fade antes de pausar; ao regressar, sobe gradualmente. O fade do misturador dura cerca de 250 ms e pode inverter o sentido sem reiniciar o motor. Os comandos são libertados ao perder o foco.

Os loops WAV são locais e originais, gerados por `scripts/generate-engine-audio.cjs`; não dependem de serviços de som externos. Cada loop tem 16 segundos e é guardado na cache do dispositivo antes de tocar, incluindo ao trocar de veículo. A reprodução mantém-se contínua nas transições do loop e evita reconfigurar a rotação com alterações mínimas. No multiplayer, cada leitor de áudio acompanha o mesmo carro, mesmo quando a ordem dos carros por distância muda. Para regenerar os sons: `npm run audio:generate`. A reprodução usa `expo-audio`, incluído no Expo Go compatível com o SDK 58, sem pedir acesso ao microfone. Depois de atualizar as dependências, reinicia o Expo com `npm start -- --clear`.

No navegador, o som usa Web Audio com os ficheiros descodificados em memória. A rotação e o volume mudam por rampas no relógio do áudio, e o mesmo loop mantém a sua fase ao silenciar e retomar. Em iOS/Android, a reprodução usa `expo-audio` e os ficheiros em cache.

A buzina usa um loop original de dois tons, em leitores separados dos motores. Cada clique ativa um som de cerca de 180 ms, seguido de um fade curto; um novo clique troca imediatamente o pitch aleatório e renova o toque sem recarregar o som. No multiplayer, os outros jogadores ouvem o mesmo tom até 80 m, com volume reduzido pela distância. Ao perder o foco, abrir menus, desligar o som ou perder a ligação, a buzina deixa de tocar; o servidor também liberta comandos sem atualizações. `npm run audio:generate` gera motores e buzina.

## Veículos

Abre **Veículos** (tecla V no computador) para comparar os modelos. **Testar na pista** coloca o modelo escolhido na mesma entrada do percurso, em Low; **Testar no plano** coloca-o na garagem em High. A simulação fica em pausa enquanto o seletor está aberto. Podes voltar ao seletor e trocar de veículo a qualquer momento; a câmara mantém o modo escolhido e os comandos anteriores são libertados.

| Modelo | Altura ao solo aproximada | Máxima em High | Vantagens e limitações |
| --- | --- | --- | --- |
| Serra 4×4 | 54 cm | 83 km/h | Equilíbrio entre velocidade e capacidade no terreno. |
| Rocha Crawler | 86 cm | 58 km/h | Rodas maiores e suspensão de maior curso; mais pesado e lento, exige cuidado nas inclinações laterais. |
| Vale Rally | 32 cm | 122 km/h | Mais leve, baixo e rápido; raspa com mais facilidade e tem menos curso de suspensão nas lombas. |
| Serra GT3 | 15 cm | 180 km/h | Coupé de circuito, pneus largos, suspensão curta e apoio aerodinâmico; raspa muito facilmente fora do asfalto. |

As alturas são estimadas em repouso, em plano. Cada modelo tem geometria, massa, dimensões de colisão, raio das rodas, aderência, suspensão e relações Low/High próprios. O Crawler tem bagageira de tejadilho, snorkel e proteções; o Rally tem carroçaria baixa, faixa clara e aileron. Os travões suaves adaptam a força à massa de cada veículo.

O Serra GT3 é um modelo original inspirado nos coupés GT3: carroçaria contínua com guarda-lamas integrados, capô baixo, teto e vidros curvos, faróis LED ovais, entradas de ar, splitter, difusor e aileron com apoios de pescoço de cisne. Usa pneus slick e jantes de cinco raios duplos com porca central, pintura azul com faixa clara e número 7. Tem som de motor próprio, travões adaptados à velocidade e força aerodinâmica proporcional ao quadrado da velocidade, aplicada apenas com rodas em contacto e o carro direito. Seleciona-o em **Veículos → Serra GT3 → Circuito de corridas · HIGH**. O modelo também funciona online; publica o site e o servidor atualizados (protocolo 10, com as dimensões do GT3, buzinas sincronizadas e economia competitiva).

## Multiplayer

Inicia sessão e abre **Online** (tecla M no computador), indica o servidor e cria uma sala ou entra com um código. O servidor valida o token Supabase e usa o nome/cor do perfil autenticado. Até quatro jogadores partilham o terreno, com física e colisões calculadas num servidor Node.js/Colyseus. O modo individual continua disponível sem conta. **Sair da sala** volta ao modo individual.

O **lobby Online** permite escolher um dos quatro carros e mostra nome, cor e pronto. O anfitrião inicia com 2–4 jogadores ligados e todos prontos. Seguem-se contagem, corrida no circuito de 399 m, resultados e garagem para outra ronda ou fim. Cada vitória vale **1 ponto**; ganha quem atinge **15** (demo: 3). As entradas ficam bloqueadas após o início, mantendo reconexões válidas. Checkpoints, recuperação, meta, vencedor e pontos são validados no servidor, com colisões preservadas. O carro local usa predição/reconciliação; adversários usam interpolação. Regras e provas de 60/20 Hz: [competição multiplayer](docs/multiplayer-competition.md).

Perder ligação ou passar para segundo plano reserva o lugar durante **30 segundos**, configuráveis no servidor. O regresso exige o token de reconexão e a mesma conta Supabase, mantendo carro, pontos, saldo, melhorias, combustível e progresso. O carro continua físico com travão e sem comandos/buzina. O ecrã mostra o prazo e só confirma sucesso após receber o estado completo. Expirar liberta o lugar; o código não recupera a identidade anterior. O anfitrião só é transferido na saída definitiva/expiração. Não existe recuperação após reinício do servidor ou ao fechar/recarregar a aplicação.

Antes de começar a competição por rondas, **Treino individual · guardar volta** mantém a volta cronometrada anterior. Os 30 checkpoints do **Desafio da Serra** continuam exclusivamente no desafio local, com os mesmos melhores tempos da sessão e +5 s por recuperação. Em **A minha conta**, podes editar nome/cor, consultar resultados/pontos, saldo, estatísticas e histórico. Aplica as quatro migrações: [Supabase](docs/supabase-setup.md).

Entre rondas, abre **Online → Garagem**, cancela Pronto e compra motor, depósito ou controlo aéreo. Cada compra mostra preço, nível e próximo efeito; só uma compra confirmada é aplicada na ronda seguinte. Saldo global da conta preservado; níveis por participante/competição/veículo. Resultados, pontos, recompensas e estatísticas são guardados numa transação idempotente. As rondas com melhorias usam uma variante v3, preservando tempos anteriores e física base dos modos locais. Regras e pendências: [garagem e persistência](docs/garage-persistence.md).

Nas rondas, **Q/E** ou **Rodar atrás/à frente** controlam o carro só no ar. Cada volta completa rende 25 moedas após aterragem válida; quedas e recuperação anulam o prémio pendente. Moedas e combustível são recolhas individuais, uma vez por ronda. O HUD mostra combustível, saldo e prémio pendente; a zero não há propulsão e recuperar não reabastece. A variante v2 inclui uma rampa lateral opcional, preservando tempos anteriores e os modos locais. Regras, persistência e testes pendentes: [economia da competição](docs/race-economy.md).

O servidor está configurado para alojamento público com `render.yaml`; o endereço por defeito é `https://serrarunner.onrender.com`. A disponibilidade e a versão desse serviço precisam de ser confirmadas no alojamento. Segue [as instruções de publicação e teste](server/README.md). Para testar no computador: `npm run server:dev` e usa `http://localhost:2567` no menu Online. Para redes diferentes, usa a URL HTTPS/WSS do serviço publicado.

Ecrã fixado na horizontal em mobile. Direção e pedais grandes em lados separados; travão, acelerador, marcha-atrás e buzina têm zonas próprias. O velocímetro ocupa o centro, com **Câmara** e **Recuperar** sempre visíveis. **Menu → Os teus controlos** permite aumentar botões e trocar os lados, guardando a preferência no dispositivo. Os controlos seguem cada dedo: podes acelerar/virar/travar em simultâneo e levantar um dedo mantém os restantes. Abrir o menu, sair da aplicação ou perder foco liberta os comandos. Teclado preservado; **Esc** abre/fecha o menu. A validação visual e em dispositivo físico do novo layout continua pendente.

**Menu → Som, vibração e imagem** guarda as definições no dispositivo. Desligar som inclui motores e buzinas em todos os modos. Qualidade reduzida desliga sombras e decoração para aliviar o desenho, preservando física/colisões. As instruções de cada modo estão no mesmo menu; no formato compacto, o Desafio da Serra também se abre aí. O HUD adapta-se à condução, Desafio ou competição. Ver [interface e validação](docs/interface-validation.md): exportações e testes automáticos disponíveis; medição da meta de 30 FPS e testes em Expo Go/navegador reais pendentes.

## Física e modelo

Jeep construído com geometria low poly: carroçaria, portas, janelas, espelhos, faróis, grelha, para-choques, quatro rodas e pneu suplente. Os materiais são locais e não requerem descarregamentos de modelos ou texturas.

Física com gravidade, colisão com o chão, chassis de 700 kg, tração nas quatro rodas, suspensão independente por raycast, aderência dos pneus, direção suavizada e travagem antes de inverter o sentido. Velocidade aproximada máxima: 83 km/h para a frente e 29 km/h em marcha-atrás. A câmara segue o veículo com suavização. Ao atingir o limite da área (240 m), o jeep regressa ao início.

O contacto da suspensão considera o contorno e a largura dos pneus para detetar lombas e o lado mais alto das inclinações. Colisores nos pneus, colocados no limite de compressão da suspensão, apoiam o carro quando tomba de lado e impedem que a suspensão comprima além do seu curso. Estes colisores não acrescentam atrito à aderência já calculada pelas rodas. O chassis tem a parte inferior chanfrada junto dos para-choques e baixo atrito contra o terreno para raspar e deslizar nas lombas. As rodas desenhadas acompanham o terreno depois da interpolação, tanto no modo individual como online. Alterações à física partilhada exigem voltar a publicar o servidor no Render.

## Código

- `src/game/jeep.ts`: modelo e materiais.
- `src/game/vehicles.ts`: características e afinação dos quatro veículos.
- `src/game/gt3-model.ts`: carroçaria e detalhes do GT3.
- `src/game/horn-audio.ts`: pitches, vozes, distância e fades das buzinas.
- `src/game/physics.ts`: física, suspensão e comandos.
- `src/game/race-track.ts`: traçado, grelha e colisões do circuito partilhados com o servidor.
- `src/game/race-track-scene.ts`: asfalto, pianos, barreiras, marcações e pórtico da partida.
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
npm run test:challenge
npm run test:audio
npm run test:interface
npm run test:controls
npm run test:auth
npm run test:database
npm run test:multiplayer
npm run test:competition
npm run test:tournament
npm run test:tournament:online
npm run test:prediction
npm run test:prediction:online
npm run test:economy
npm run test:economy:online
npm run test:garage
npm run test:reconnection
npx expo export --platform web
```

O lint usa diretamente ESLint com a configuração oficial do Expo, porque o comando `expo lint` deste SDK falha ao detetar a instalação local do ESLint neste ambiente.
