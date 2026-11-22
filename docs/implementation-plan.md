# Ramp Rivals — Plano de implementação

Última revisão em 22 de novembro de 2026. Estado confirmado por leitura do código, inventário local de dependências e verificações indicadas abaixo.

## Âmbito atual

- Reutilizar o jogo existente e alterar o nome apresentado para **Ramp Rivals**.
- Atualizar o ecrã de condução, garagem, menu online, configuração Expo/web, título HTML, mensagens do servidor/setup e documentação.
- Preservar as alterações locais que já existiam antes desta intervenção, incluindo a implementação do desafio.
- Manter os nomes **Serra 4×4**, **Rocha Crawler**, **Vale Rally**, **Serra GT3**, **Circuito da Serra** e **Desafio da Serra**.
- Manter os identificadores técnicos: pacote `serrarunner`, slug Expo `SerraRunner`, scheme `serrarunner`, sala Colyseus `serra_drive`, serviço Render `serra-runner-multiplayer`, URL `https://serrarunner.onrender.com`, IDs dos veículos e caminhos dos assets. O protocolo atual é **10**, incluindo garagem, economia, fases de competição, ACK e estado de reconciliação; publicar cliente e servidor compatíveis em conjunto.
- Acrescentar conta Supabase, perfil próprio protegido por RLS e resultados de uma volta competitiva no circuito, calculados pelo servidor. O Desafio da Serra continua local e sem conta.
- Competição de 2–4 jogadores com lobby/pronto, rondas, +1 ponto por vitória, objetivo normal de 15 e demonstração configurável; predição/reconciliação local e interpolação dos adversários. Regras, arquitetura e verificações em [multiplayer-competition.md](multiplayer-competition.md).
- Economia competitiva autoritativa: rotações aéreas Q/E/touch, aterragem validada, moedas e combustível individuais por ronda, depósitos por veículo e saldo protegido. Regras e limites em [race-economy.md](race-economy.md). Variante `serra-circuit-race-v2` com rampa lateral opcional, mantendo registos anteriores e modos locais intactos.
- Garagem entre rondas: compras de motor/depósito/controlo aéreo, saldo global já existente, níveis por participante/competição/veículo e aplicação confirmada na ronda seguinte. Fecho atómico de resultados/pontos/saldos/estatísticas, histórico no perfil e variante `serra-circuit-race-v3`, preservando v1/v2. Regras e limites em [garage-persistence.md](garage-persistence.md).
- Manter Expo Go físico e navegador, sem eject, prebuild nem development builds. Dependências novas instaladas através de `expo install`, sem alterar SDK, Three.js ou física.

## Versões confirmadas no ambiente

Existe `package-lock.json`, sem `bun.lock`; o projeto usa npm. `npm ls --depth=0` terminou sem erros de dependências.

| Tecnologia | Versão instalada | Utilização |
| --- | --- | --- |
| Node.js / npm | 24.14.0 / 11.9.0 | Ferramentas e servidor; `engines.node` exige >=22.13.0 |
| TypeScript | 6.0.3 | Aplicação e servidor |
| Expo | 58.0.22 | SDK 58; declarado como `~58.0.22` |
| React / React DOM | 19.3.0 / 19.3.0 | Interface mobile/web |
| React Native / React Native Web | 0.88.1 / 0.21.4 | Interface multiplataforma |
| Expo Router | 58.0.29 | Rotas em `src/app/` |
| Three.js / tipos Three.js | 0.162.0 / 0.162.0 | Cena 3D; manter a versão fixada pelo adaptador GL existente |
| expo-gl | 58.0.4 | GLView e contexto nativo |
| expo-audio / expo-asset | 58.0.11 / 58.0.20 | Sons locais e cache |
| cannon-es | 0.20.0 | Física local e autoritativa no servidor |
| @colyseus/core | 0.16.26 | Salas e simulação no servidor |
| @colyseus/ws-transport / @colyseus/schema | 0.16.5 / 3.0.76 | Transporte e dependências Colyseus |
| colyseus.js | 0.16.22 | Cliente multiplayer |
| @supabase/supabase-js | 2.119.0 | Autenticação, sessão, perfis e resultados |
| @react-native-async-storage/async-storage | 2.2.0 | Persistência da sessão nativa, compatível com Expo Go |
| react-native-url-polyfill | 4.0.0 | Compatibilidade do cliente Supabase em React Native |
| @electric-sql/pglite | 0.5.16 | Dependência apenas de desenvolvimento para testar SQL/RLS em PostgreSQL |

Antes de alterar APIs Expo/React Native, consultar a documentação do SDK 58. Foram consultados o [índice versionado](https://docs.expo.dev/versions/v58.0.0/), o [índice para agentes](https://docs.expo.dev/llms.txt), a [configuração da aplicação](https://docs.expo.dev/versions/v58.0.0/config/app/), [GLView](https://docs.expo.dev/versions/v58.0.0/sdk/gl-view/), [áudio](https://docs.expo.dev/versions/v58.0.0/sdk/audio/) e [HTML estático do Expo Router](https://docs.expo.dev/router/web/static-rendering/#root-html). GLView e expo-audio estão documentados como incluídos no Expo Go. A execução no dispositivo físico continua a precisar de validação manual.

## Funcionalidades existentes

“Existente” significa implementado no código; a execução em dispositivos e serviços públicos só é considerada validada quando houver evidência explícita.

| Funcionalidade | Estado confirmado e comportamento a preservar | Código principal |
| --- | --- | --- |
| Condução livre | Sem cronómetro ou limite de tempo. Garagem, terreno e circuito no mesmo mundo; recuperação ao ultrapassar os limites do mapa. Mobile horizontal e navegador. | `src/components/driving-scene.tsx`, `src/game/scene.ts`, `src/game/physics.ts` |
| Quatro veículos | Modelos, massa, dimensões, suspensão, aderência, LOW/HIGH e motores próprios. Limites HIGH: cerca de 83, 58, 122 e 180 km/h, respetivamente. | `src/game/vehicles.ts`, `src/game/jeep.ts`, `src/game/gt3-model.ts`, `src/components/vehicle-garage.tsx` |
| Todo-o-terreno | Rampas, lombas desencontradas e inclinação lateral. Grelha de alturas partilhada entre desenho e física. | `src/game/terrain.ts`, `src/game/trail-models.ts`, `src/game/physics.ts` |
| Circuito da Serra | Comprimento calculado de **399,135 m** (aproximadamente 400 m), quatro lugares na grelha, pianos e barreiras com colisão. | `src/game/race-track.ts`, `src/game/race-track-scene.ts` |
| Desafio da Serra | Comprimento calculado de **845,560 m** (aproximadamente 846 m), **exatamente 30 checkpoints ordenados**, contagem de 3 s, túnel, ponte, chicane, lombas, slalom e rampas. Disponível a solo com os quatro veículos. | `src/game/challenge-course.ts`, `src/game/challenge-scene.ts`, `src/game/challenge-collisions.ts` |
| Cronometragem do desafio | Valida ordem, sentido, largura e altura da passagem. Recuperar soma **5 s** e regressa ao último checkpoint. Meta congela o tempo; repetição e troca de veículo disponíveis. Melhores tempos em memória, separados por veículo durante a sessão. | `src/game/challenge-run.ts`, `src/components/challenge-menu.tsx`, `src/components/challenge-hud.tsx` |
| Multiplayer por convite | Códigos de oito caracteres, até **4 jogadores**, troca de veículos, grelha do circuito, snapshots e reconexão. Física a 60 Hz e snapshots a 20 Hz; servidor calcula posições e colisões entre veículos num mundo partilhado. | `server/drive-room.ts`, `src/game/network-types.ts`, `src/game/multiplayer-client.ts` |
| Física | Suspensão independente por raycast, contacto com largura dos pneus, tração, travagem, marcha-atrás, direção suavizada e LOW/HIGH. GT3 com apoio aerodinâmico em contacto com o chão. | `src/game/physics.ts`, `src/game/terrain-vehicle.ts`, `src/game/wheel-terrain.ts`, `src/game/chassis-shape.ts` |
| Câmaras e comandos | Três câmaras e arrasto livre preservados. Direção e pedais em zonas separadas, botões maiores, legendas contrastadas, LOW/HIGH junto ao velocímetro, câmara/recuperação sempre visíveis. Menu com tamanho e troca de lados guardados no dispositivo. Multitouch, teclado, ativação assistida e libertação ao perder foco. | `src/components/driving-controls.tsx`, `src/components/driving-scene.tsx`, `src/game/control-layout.ts`, `src/hooks/use-control-preferences.ts` |
| Áudio | Motores locais distintos, rotação e volume dinâmicos, mute e fades. Buzina por toque com tom aleatório diferente do anterior. Online: motores até 60 m e buzinas até 80 m, com atenuação por distância. | `src/game/engine-audio.ts`, `src/game/horn-audio.ts`, `src/game/web-engine-player.ts`, `src/hooks/use-*-sounds*` |
| Nome apresentado | Ramp Rivals em configuração, ecrãs, título HTML, mensagens e documentação. Nomes do conteúdo e identificadores existentes preservados. | `app.json`, `src/app/+html.tsx`, `src/components/`, `server/index.ts`, `scripts/setup.cjs` |
| Conta e sessão | Registo/login/logout, confirmação por código ou link seguido de login, restauro e renovação automática de sessão. Estados de carregamento, falhas de rede, credenciais inválidas e expiração. Rota `/account` usa o Stack Expo Router existente e suspende os comandos do jogo. | `src/auth/`, `src/components/account-screen.tsx`, `src/app/account.tsx` |
| Perfil e permissões | Nome e cor preferida, aplicados aos veículos locais/online. Trigger cria o perfil. RLS e permissões por coluna permitem editar apenas nome/cor do próprio perfil; saldos, melhorias, estatísticas e resultados não são escritos pelo cliente. | `supabase/migrations/20261113000100_profiles_and_results.sql`, `server/supabase.ts` |
| Identidade online | Token validado em Supabase Auth, perfil lido sob RLS, identidade ligada à ligação. Não confia em ID/nome/cor enviados pelo cliente. Renovação revalidada, conta imutável durante a ligação e corte por expiração. | `server/drive-room.ts`, `server/supabase.ts`, `src/game/multiplayer-client.ts` |
| Reconexão autenticada | Reserva normal de 30 s, configurável. Colyseus 0.16 preserva a sessão; o transporte verifica Supabase/conta/sessão antes de consumir a reserva. Mesmo carro, combustível, níveis, saldo, pontos e progresso; novo snapshot/revisão/época limpa comandos antigos. Sem jogadores duplicados nem replay de compras/eventos/resultados. | `src/game/reconnection-config.ts`, `server/index.ts`, `server/drive-room.ts`, `src/game/multiplayer-client.ts` |
| Competição persistente | Volta cronometrada de circuito, com contagem e setores ordenados próprios, mantendo colisões. Tempo e UUID calculados no servidor; escrita com chave exclusivamente do servidor. Falha de escrita permite retry idempotente. Últimos 20 resultados da conta consultáveis. | `src/game/competition.ts`, `server/drive-room.ts`, `src/components/online-menu.tsx` |
| Competição por rondas | 2–4 jogadores, anfitrião, nome/cor/veículo/pronto, entradas bloqueadas após começar e reconexão validada. Lobby → contagem → corrida → resultados → garagem → nova ronda/fim. +1 por vitória e campeão aos 15 (demo 3), sem usar dinheiro. | `src/game/tournament.ts`, `server/drive-room.ts`, `src/components/tournament-lobby.tsx` |
| Percurso competitivo | Circuito de 399,1 m, 12 setores/13 passagens próprias, continuidade e corredor validados, recuperação server-side de +5 s, limite de 180 s e desempate por tempo/ID. Sem chegada válida não atribui vencedor/pontos. | `src/game/circuit-race.ts`, `src/game/circuit-race-scene.ts` |
| Predição e reconciliação | Comandos locais a 60 Hz, lotes a 30 Hz, ACK e estado de física completo nos snapshots a 20 Hz. Restauro/replay dos pendentes, correções suaves, revisão em recuperações e interpolação remota de 80 ms. Colisões definitivas mantidas no servidor. | `src/game/prediction.ts`, `src/game/network-config.ts`, `src/game/physics.ts`, `src/game/scene.ts` |
| Saltos com prémio | Torque de pitch apenas no ar, comandos táteis independentes e Q/E. Voltas líquidas de 360° e múltiplas voltas, sem acumular oscilações/chão. Prémio pendente até orientação, impacto e estabilidade válidos; queda, recuperação e aterragem inválida anulam-no. Um pagamento por salto. | `src/game/stunts.ts`, `src/game/physics.ts`, `src/components/driving-scene.tsx` |
| Moedas e combustível | Oito moedas de 10 e dois depósitos de até 5 L, individuais por ronda e validados no servidor. Capacidades/consumos próprios, zero combustível sem propulsão mantendo inércia/travão. Recuperar conserva combustível e recolhas. HUD mostra combustível/saldo/prémio pendente. | `src/game/economy-config.ts`, `src/game/economy-course.ts`, `src/game/race-economy.ts` |
| Saldo persistente | RPC só do servidor, registo idempotente de eventos e incremento de saldo atómico. RLS/permissões impedem clientes de alterar saldos/recompensas; moedas nunca contam como pontos. Retry mantém os mesmos eventos. | `server/economy-wallet.ts`, `supabase/migrations/20261113000300_race_economy.sql` |
| Garagem e compras | Menu entre rondas mostra saldo, níveis, preço e efeito. Motor +10%, depósito +25%, controlo aéreo +20% por nível, máximo 3; valores configuráveis e catálogo SQL verificado. UUID da oferta, preço/nível/saldo/fase/participação validados, transação e bloqueios contra compras simultâneas. Níveis só aplicados na ronda seguinte; física local base. | `src/game/upgrades.ts`, `server/garage.ts`, `src/components/competition-garage.tsx` |
| Fecho atómico e histórico | Competições, participantes, níveis, movimentos e estatísticas persistidos. Fecho grava resultados, +1 ponto, recompensas e estatísticas numa transação idempotente. Créditos durante a corrida ficam por confirmar até ao fecho. Perfil lê saldo, variantes/níveis dos resultados, rondas, participações, melhorias e últimos movimentos sob RLS. | `supabase/migrations/20261113000400_garage_persistence.sql`, `src/auth/game-history.ts`, `src/components/account-screen.tsx` |

Os **30 checkpoints pertencem exclusivamente ao Desafio da Serra**. O circuito de 400 m não recebe estes checkpoints. O servidor continua a usar `createPhysicsWorld()` e a física partilhada existente, incluindo as colisões do terreno, circuito e carros. O mundo do desafio é ativado separadamente no modo individual com `includeChallenge`; não foi transferido para as salas online.

## Funcionalidades parciais e limites atuais

| Área | O que existe | O que falta ou limita a validação |
| --- | --- | --- |
| Compatibilidade Expo Go | GLView, adaptador Three.js sem canvas DOM nativo, áudio Expo e resolução Colyseus para Android/iOS em `metro.config.js`. | Teste manual atual em Expo Go físico Android/iOS: arranque, GL, multitouch, áudio, foco e entrada numa sala. Não há nova validação física nesta intervenção. |
| Navegador | Implementação web, Web Audio e exportação estática configurada para Vercel. | Validar visualmente a interface, título do separador, controlos e som em navegadores reais, incluindo mobile. Exportação não prova desempenho nem reprodução real. |
| Multiplayer público | Servidor Node/Colyseus, endereço por defeito e configuração Render existentes; testes locais com WebSockets reais. | Confirmar disponibilidade/versão publicada e testar dois dispositivos em redes diferentes. A publicação não foi executada. |
| Persistência | Sessão/perfil Supabase e resultados competitivos com código e migração entregues. Melhores tempos do desafio local continuam em memória; salas temporárias. | Credenciais e validação do projeto real pendentes. Resultado ainda não confirmado pelo Supabase só permanece na memória da sala para retry; não há fila durável em caso de reinício/saída definitiva. |
| Resposta online | Predição/reconciliação local, proxies de contacto, adversários interpolados e reconexão autenticada com reserva configurável de 30 s. | WebSockets reais, segundo plano via API do cliente e atraso/jitter testados; ciclo físico AppState/Expo Go e redes reais pendentes. Sala/reserva/ticket em memória, sem restauro após reinício de servidor ou aplicação. |
| Economia | Física e servidor implementados, registo SQL/RLS e retry idempotente. Testes locais cobrem aterragem paga, recolhas repetidas e combustível esgotado. | Credenciais/migração Supabase real, ergonomia multitouch e afinação de saltos nos quatro veículos em dispositivo pendentes. Créditos ainda não confirmados têm fila apenas em memória da sala. |
| Garagem/persistência | Compras atómicas e fecho idempotente testados em SQL/PGlite e clientes WebSocket, incluindo respostas perdidas após commit. Saldo global preservado, níveis por competição/veículo e estatísticas acumuladas no perfil. | Aplicar quarta migração e validar concorrência com sessões PostgreSQL independentes/Data API reais, persistência após novo login e interface em Expo Go físico. Sem restauro de sala em curso após reiniciar processo. |
| Interface secundária | A revisão removeu a rota de tutorial `/explore` e os componentes demonstrativos do template. As rotas de produto são `/` e `/account`. | Validação visual em navegador e telemóvel pendente. |
| Interface e desempenho | HUD por modo, definições persistentes de som/vibração/qualidade, instruções, zonas de polegares separadas da câmara, batching e limpeza por modo. Testes estruturais com renderer simulado. | Validação visual, ergonomia/fonte/leitores de ecrã, áudio/vibração e persistência em navegador/Expo Go físicos. Meta ≥30 FPS ainda sem medição GPU/dispositivo; ver [interface-validation.md](interface-validation.md). |

## Configuração real e trabalho em falta

**A integração Supabase está implementada no código, mas não validada num projeto real.** Não existem credenciais nas variáveis do ambiente nem ficheiros `.env.local`. As instruções completas, exemplos de variáveis do cliente/servidor, migração, configuração de email e checklist manual estão em [supabase-setup.md](supabase-setup.md).

Falta aplicar a migração no projeto alvo, configurar chaves, SMTP e template de confirmação, e validar registo, email, renovação, RLS via Data API e resultados reais em navegador/Expo Go físico. As salas, snapshots e colisões continuam em Node/Colyseus/cannon-es. Não foi usado Supabase Realtime para substituir a física.

Não foram implementados classificação global, recuperação de palavra-passe ou autenticação social. Saldo, níveis e estatísticas só são escritos por operações autoritativas; os JSON legados de melhorias/estatísticas permanecem intactos. Não converter os melhores tempos locais da sessão em resultados competitivos.

## Configuração e regras

- Regras já especificadas: quatro jogadores, 30 checkpoints do desafio e recuperação de +5 s são requisitos a preservar. `MAX_PLAYERS` está em `network-types.ts`; a penalização e a contagem decrescente estão em `challengeCourse`.
- Afinação dos carros: manter os valores tipados em `vehicles.ts`. Geometria do circuito e do desafio continua nos módulos de percurso, partilhada com os respetivos colisores.
- Configuração operacional existente: `EXPO_PUBLIC_MULTIPLAYER_URL` e campo do menu Online para o endereço; `PORT` para o servidor (2567 por defeito). Preservar nomes e valores por defeito existentes.
- Limite de 32 salas e timeout de comandos de 500 ms preservados. Reconexão passa a 30 s em `reconnectionRules`, configurável por `RECONNECT_WINDOW_SECONDS` no servidor (0 < valor <= 300); cliente recebe a duração no snapshot. Não há um prazo extra de autenticação depois de consumir o lugar: a identidade é validada antes.
- Nos próximos pedidos, regras novas não especificadas devem ser parâmetros tipados com valor por defeito documentado, partilhados por cliente e servidor quando aplicável. Configuração de alojamento deve usar variáveis de ambiente validadas. Não espalhar novos valores literais pela interface e simulação.
- Supabase: `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no cliente; `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` no servidor. Exemplos vazios versionados; ficheiros de segredos ignorados. `server:start` carrega opcionalmente `server/.env.local`.
- Regras de autenticação em `src/auth/config.ts`; nome/cor/palavra-passe em `src/auth/profile.ts`; competição em `src/game/competition.ts` (12 setores, 3 s, limite de 600 s, percurso `serra-circuit-v1`). As constraints SQL têm de acompanhar futuras alterações aos limites/identificador do percurso através de uma nova migração.
- Rondas: `tournamentRules` define 15 pontos normais, demo 3, contagem 3 s, corrida 180 s e resultados 8 s. `circuitRules` define 12 setores, corredor, continuidade, recuperação +5 s, cooldown de 2 s e máximo de 10 recuperações. `networkTiming` fixa 60/20 Hz e buffer remoto de 80 ms. Migração adicional `20261113000200_multiplayer_rounds.sql` preserva registos anteriores e acrescenta rondas/atribuição de pontos atómica.
- Economia: `economyRules`/`fuelRules` centralizam prémios, quantidades, capacidades/consumos, torque, aterragem e recolhas. Geometria/posições em `economy-course.ts`. Aplicar também `20261113000300_race_economy.sql`: ledger/RPC de saldo e percurso v2, preservando os identificadores e tempos v1. Não há novas dependências; valores completos em [race-economy.md](race-economy.md).
- Garagem: `upgradeRules` e `upgrade_catalog` centralizam preços/efeitos/limites, com teste de igualdade e versão do catálogo. Aplicar `20261113000400_garage_persistence.sql`; protocolo 10 e percurso v3 para novas rondas. Saldo global por conta preservado; níveis por participante/competição/veículo; estatísticas acumuladas por perfil. Novas RPCs só do servidor para fases, compras e fecho de ronda atómico. Não há dependências novas.
- Novas dependências Expo devem ser escolhidas pela compatibilidade com Expo Go SDK 58 e instaladas com `npx expo install`. Não adicionar módulos que exijam development build.

## Verificações desta intervenção

| Verificação | Resultado |
| --- | --- |
| Inventário `npm ls --depth=0` | Passou; versões instaladas registadas acima |
| `npm run lint` | Passou após as alterações finais |
| `npm run typecheck` | Passou com autenticação, competição e economia |
| `npm run test:physics` | Passou: multitouch, câmaras, veículos, suspensão, LOW/HIGH, colisões e voltas completas dos quatro carros no circuito |
| `npm run test:controls` | Passou: espaço disponível em 8 dimensões de ecrã, preferências, interação independente de dedos/ponteiros, cancelamento/saída/foco, teclado, ativação assistida, comandos desativados e troca dos lados. Fixture dos hosts React Native; não é validação visual ou física |
| `npm run test:interface` | Passou: definições e hidratação concorrente com edição, escritas em fila, persistência após remount, falhas/retry/unsubscribe, HUD normal/compacto, instruções e cancelamento/limite de vibração em fixtures nativas/web |
| `npm run test:challenge` | Passou: ordem/sentido/largura, +5 s, tempos por veículo e os quatro carros a completar os 30 checkpoints |
| `npm run test:audio` | Passou: motores, buzinas, tons, distância, mute/foco e misturadores web com áudio simulado |
| `npm run test:multiplayer` | Passou: servidor compilado, WebSockets reais, colisões em mundo partilhado, quatro jogadores, limites, grelha, isolamento, reconexão e saída |
| `npm run test:reconnection` | Passou com Colyseus real e fixture HTTP Auth: identidade errada não consome reserva, código não assume outra conta, estado completo preservado, combustível/níveis/checkpoints/eventos, época antiga recusada, compra/coin/round únicos, segundo plano/regresso, expiração e transferência de anfitrião sem participantes suficientes. Prazo reduzido apenas nos testes |
| `npm run test:auth` | Passou: validações, configuração ausente, token verificado/expirado/inválido, credenciais, contrato SDK de persistência/restauro/renovação/logout e confirmação de email em fixture HTTP; competição física com os quatro veículos |
| `npm run test:database` | Passou em PostgreSQL/PGlite: migração, backfill, trigger, metadados maliciosos, permissões de coluna, RLS entre utilizadores, dados protegidos e resultados só pelo servidor |
| `npm run test:economy` | Passou: voltas múltiplas, invalidações, oscilações/chão, aterragem física paga uma vez, recolhas individuais/repetidas, combustível esgotado/recuperação, ACK/replay sem consumo duplicado e retry de saldo |
| `npm run test:economy:online` | Passou: dois clientes reais, recolha física, saldos privados, zero combustível, recuperação sem reabastecer, valores do cliente ignorados, falha/retry sem duplicação; dinheiro não gera pontos |
| SQL da economia | Passou em PostgreSQL/PGlite: terceira migração, RLS, crédito de moeda/salto único, saldo atómico, rollback de lote inválido e RPC/escrita de saldo proibidos ao cliente. Supabase real pendente |
| `npm run test:garage` | Passou: parâmetros base dos quatro carros, LOW/HIGH, torque aéreo, depósito, serialização, regresso à base local; clientes reais com ofertas, fase, compra/reenvio, resposta perdida após commit, bloqueio de Pronto/troca/fim, próxima ronda e âmbito da competição |
| SQL da garagem | Passou em PostgreSQL/PGlite: quarta migração, catálogo, RLS, participação, fase, saldo/nível/limite, compra única, fecho atómico com rollback entre participantes e campeão/estatísticas uma vez. Concorrência em serviço real pendente |
| `npm run test:competition` | Passou: volta com física e WebSockets reais, cancelamento por reposição, falha de persistência e retry, autor verificado, corte por troca de identidade e expiração; Supabase representado por fixture HTTP de teste |
| `npm run test:tournament` | Passou: 15 vitórias/15 pontos, desempate determinístico, timeout sem chegada, fases, permissões/pronto, recuperação, atalhos e percurso físico dos quatro veículos |
| `npm run test:tournament:online` | Passou: quatro clientes, quinto/entrada tardia bloqueados, reconexão em sala bloqueada, cadência de snapshots (3 ticks cada), sala isolada, volta física, +5 s de recuperação, +1 ponto, objetivo demo, retry e novo lobby |
| `npm run test:prediction` | Passou a 30/60/144 fps e com 100 ms de atraso por sentido/jitter: resposta, ACK/replay, correções, revisões, snapshots fora de ordem e proxies |
| `npm run test:prediction:online` | Passou: cliente multiplayer/preditor reais com Colyseus, lotes, ACKs, aceleração, travagem, histórico limitado e saída limpa |
| `npm run web:build` | Passou com rota `/account`; cinco páginas HTML geradas |
| Inspeção da exportação web | Passou: conta, estado de configuração em falta e condução livre presentes; configuração secreta do servidor e fixtures ausentes dos bundles do navegador |
| Bundles Android/iOS | Exportação Hermes passou para ambos com garagem e perfil em `.expo/garage-native-export`. Não foram gerados projetos nativos nem development builds |
| `/health` local | Identifica Ramp Rivals, protocolo 10. Não comprova disponibilidade do Supabase |
| `git diff --check` | Passou |
| `npx expo install --check` | A verificação online sinaliza versões anteriores já existentes: Expo 58.0.22 → ~58.0.25, Router 58.0.29 → ~58.0.31, safe-area-context 5.10.1 → ~5.11.1 e atualizações de patches noutros módulos Expo. As novas dependências de autenticação não foram sinalizadas. Atualização do conjunto Expo pendente; versões existentes preservadas neste pedido |
| Expo Go físico / navegadores reais / alojamento público / Supabase | Pendentes; não considerados aprovados pelos testes automáticos |

O teste multiplayer provoca deliberadamente rejeição de protocolo e quebra de ligação para verificar os fluxos de erro e reconexão. Os respetivos avisos são esperados quando o comando termina com sucesso. Os testes de cena e áudio usam simulações de renderer/leitores e não substituem validação audiovisual real.

## Rework dos controlos — 21 de novembro

- Direção num lado e travão/acelerador no outro; marcha-atrás e buzina numa fila separada para evitar toques acidentais. Acelerador destacado, travão com cor própria e estado premido visível sem reduzir o contraste do texto.
- Largura dos pedais calculada conforme espaço: 56–76 px no tamanho normal e até 88 px no maior; direção com 84–94 px de altura, travão/acelerador com 96–108 px, limitando a altura em ecrãs baixos. Utilitários com 56 px e ações rápidas/LOW/HIGH com pelo menos 48 px. Na vertical, velocímetro/LOW/HIGH passam para uma fila própria; não sobrepõem os pedais por posicionamento absoluto.
- **Câmara**, **Recuperar** e **Menu** visíveis. O menu é um modal com scroll, botão de voltar e ajuda de teclado. **Menu → Botões maiores** e **Trocar lados** não alteram a física; preferências guardadas em AsyncStorage já instalado, chave nova `ramp-rivals:controls:v1`. Falha de armazenamento mantém a escolha na sessão e é indicada.
- Cada toque continua identificado separadamente. Web liberta ao sair/cancelar e ao perder foco de tecla; native trata todos os `changedTouches`. Espaço/Enter num botão focado não ativam um segundo comando global. Ativação de leitor de ecrã pode ligar/desligar um pedal com identificador próprio; abrir menus, recuperar, mudar preferências ou perder foco limpa os comandos. Arrasto da câmara permanece na zona livre e separado dos botões.
- O menu de condução substitui as antigas opções em linha e mantém o cronómetro a correr, com aviso durante corridas. Os seletores de veículo/desafio e perda de foco mantêm o comportamento anterior. O rework não alterou checkpoints, penalizações, física base, tempos existentes ou economia.
- Lint, typecheck, exportação web, bundles Android/iOS e testes de controlos/física/desafio passaram. Os quatro veículos mantêm os tempos e 30 checkpoints do teste anterior. O teste de torneio completo voltou a passar, incluindo o fim da competição após a correção da garagem.
- **Validação pendente:** navegador de pré-visualização indisponível nesta sessão (IAB e Chrome). Não houve aprovação visual nem teste em Expo Go físico. Confirmar alcance real dos polegares, safe areas, aumento de fonte, VoiceOver/TalkBack, teclado, multitouch com câmara e persistência das preferências no dispositivo. Bundles atuais em `.expo/controls-native-export`; sem novas dependências, prebuild ou development builds.

## Reconexão das salas — 21 de novembro

- API instalada confirmada: core 0.16.26, cliente 0.16.22 e transporte ws 0.16.5. Usa `onLeave(client, consented)` / `allowReconnection` e `client.reconnect(token)`; sem hooks de versões posteriores.
- Janela normal de 30 s, configuração/env validada e Render/exemplo atualizados. Transporte verifica JWT Supabase da mesma conta antes de consumir o token reservado. Uma tentativa de outra identidade não recebe estado privado nem consome a reserva legítima. Código de convite não é prova de identidade. Token roda em cada ligação e não aparece nos snapshots.
- O carro desligado mantém corpo dinâmico e colisões, com travão aplicado, sem input nem buzina. Não há combustível novo ou propulsão. Relógio continua; sem checkpoints/recolhas/chegada enquanto ausente. Movimento ilegal ou passagem de checkpoint requer recuperação; treino individual online conserva progresso mas cancela se atravessar setor desligado. Desafio local e os seus 30 checkpoints/tempos/+5 s preservados.
- Regresso envia snapshot completo com física, níveis/combustível, economia/recolhas, progresso/pontos, fase e garagem/compra pendente. Mesmo objeto/jogador; revisão e época novas, filas e predição antigas limpas, ações antigas ignoradas e IDs de operações idempotentes conservados.
- AppState fecha sem consentimento em segundo plano, neutraliza comandos e só tenta retomar quando ativo. UI distingue perda, reconexão/prazo, sucesso após snapshot e expiração. Não há nova entrada automática por código depois de expirar.
- Anfitrião mantém função durante a reserva; saída definitiva/expiração transfere para o primeiro conectado. Se ninguém estiver conectado, o primeiro regresso válido assume a função. Sem dois ligados/prontos não inicia nova ronda. Uma ronda em curso continua e não atribui vitória sem chegada válida.
- Verificações: lint/typecheck, `test:reconnection`, autenticação, multiplayer/colisões, garagem, torneio e predição passaram. O torneio WebSocket inclui regresso do campeão com 1 ponto e saldo preservados, sem repetir o resultado. Web e bundles Android/iOS em `.expo/reconnection-native-export`; sem novas dependências/migrações ou projetos nativos.
- Pendentes: Supabase real, mudança de rede e ciclo AppState em Expo Go físico, dispositivos/rede separados e validação visual. As fixtures HTTP não representam integração remota concluída. Sem recuperação de sala após reiniciar servidor, nem ticket após fechar/recarregar o cliente; operações já confirmadas no Supabase permanecem, fila não confirmada continua volátil. Regras completas em [multiplayer-competition.md](multiplayer-competition.md#entradas-anfitrião-e-reconexões).

## Interface integrada e qualidade reduzida — 21 de novembro

- Menu existente integra som, vibração, qualidade e instruções de condução/Desafio/competição/garagem. AsyncStorage novo `ramp-rivals:settings:v1`, com leitura validada, silêncio até hidratar, merge de alterações durante a leitura, escritas serializadas e indicação de falha. Inicial: som ligado, vibração desligada, gráficos normais. Preferências anteriores de tamanho/lados preservadas. Sem novas dependências; versões Expo 58.0.22/RN 0.88.1/Three 0.162.0 conservadas.
- HUD local conserva velocidade/LOW/HIGH; Desafio mostra tempo/30 checkpoints/penalização acumulada; competição ganha painel compacto de pontos, saldo, litros/barra, piruetas/prémio pendente e dinheiro por guardar. Avisos de combustível zero, recuperação e reconexão mantidos. Câmara/Recuperar/Menu continuam acessíveis; no formato compacto, entrada/saída do Desafio passam para Menu. Safe areas existentes mantidas.
- Zonas dos polegares, LOW/HIGH e HUD bloqueiam o arrasto da câmara também entre botões. Liberta inputs/buzina/arrasto ao cancelar, perder foco, ocultar separador, mudar de rota ou AppState. Sair para conta usa a reserva de reconexão; sair definitivamente online remove recursos do modo e silencia vozes antigas. Timers/listeners/fetches/AudioContexts/RAF/Colyseus limpos no unmount; pools de áudio e cenário base reutilizados entre modos.
- Qualidade reduzida só afeta desenho: sem sombras/decoração sem colisões e menor distância de desenho. Nada muda na física, carros, colisões, regras, combustível, melhorias ou relógios. Batching de grelha/setas e arcos, caches de cores/materiais/recolhas e vozes de buzina limitadas a 20 Hz. HUD limitado a 120 ms; velocidade só atualiza React ao mudar valor apresentado e Desafio inativo deixa de publicar estado. Menus completos podem dispensar GPU mantendo simulação/rede/cronómetro anteriores.
- Gráficos do Desafio e dos modos online criados quando necessários e dispostos à saída. Teste estrutural: 45 meshes/linhas visíveis normais → 31 reduzidos na cena inicial, sem passagem de sombras na qualidade reduzida. Não é contagem GPU real nem FPS. Teste Cannon compara resultados exatos dos quatro carros com qualidade normal/reduzida durante o Desafio; 30 checkpoints e tempos anteriores preservados: 2:40.87 / 2:42.04 / 2:40.37 / 2:40.95.
- Parâmetros visuais e de feedback centralizados em `src/game/interface-config.ts`. Vibração RN/Expo Go e `navigator.vibrate` quando suportado; 20 ms, intervalo mínimo 250 ms, com duração escolhida pelo iOS. Não há biblioteca nativa nova ou necessidade de prebuild/development build.
- Verificações e roteiro detalhado: [interface-validation.md](interface-validation.md). Lint/typecheck, build do servidor, interface/controlos/áudio/física/desafio, multiplayer/colisões, predição online, reconexão e exportações web/Android/iOS passaram. Testes de rede continuam a usar Auth HTTP de teste. Bundles móveis em `.expo/interface-native-export`. A tentativa inicial de Hermes falhou por permissão de execução no sandbox; execução autorizada do compilador instalado passou.
- **Pendentes:** IAB e Chrome indisponíveis nesta sessão; não há telemóvel de teste ligado. Validação visual/audiovisual, multitouch real/safe areas, medições de draw calls/FPS/memória e meta ≥30 FPS continuam por medir. Exportações e fixtures não aprovam esses critérios. Supabase real e redes/dispositivos separados continuam pendentes; não há restauro de salas após reinício.

## Remoção das mudanças manuais — 21 de novembro

- Retirados os botões/indicador LOW/HIGH e atalhos L/H. O painel central mantém velocímetro e indicação de marcha-atrás; direção, pedais, buzina e piruetas conservados.
- Transmissão selecionada pelo percurso: LOW na entrada todo-o-terreno; HIGH no plano, circuito, Desafio e competição. Recuperar para a garagem ou sair de uma sala repõe a relação normal. A física base, parâmetros dos quatro carros, protocolo e dados/tempos anteriores mantêm-se.
- Instruções, legendas do menu, garagem de veículos e descrição de melhorias deixam de pedir ou apresentar mudanças manuais. Motor mostra a percentagem acumulada do próximo nível, conservando preços/efeitos existentes. Removido o feedback de mudanças manuais.
- Lint/typecheck, build do servidor e verificações de controlos/interface/garagem passaram neste pedido. Garagem online usa Colyseus real e fixture Supabase HTTP; validação visual/nativa real e medição FPS continuam pendentes conforme [interface-validation.md](interface-validation.md).

## Revisão de integração e regressões de 22 de novembro

Comparação com os requisitos do relatório transcritos nos pedidos. O repositório não inclui o relatório original em PDF ou DOCX.

| Aspeto | Produto verificado |
| --- | --- |
| Física e rede | Já existiam colisões entre carros online no mundo Cannon partilhado de cada sala. Testes com WebSockets verificaram contacto, isolamento, limite de quatro jogadores, física a 60 Hz e três ticks por snapshot (20 Hz), predição e reconciliação. |
| Percursos e tempos | O circuito mede cerca de 399 m. A competição usa 13 passagens ordenadas nesse circuito. O Desafio local mede cerca de 846 m, tem 30 checkpoints próprios e soma exatamente 5 s por recuperação. Os quatro tempos automáticos nesta revisão coincidem com a referência anterior. Os melhores tempos da sessão são separados por veículo. |
| Transmissão | O pedido posterior de remoção das mudanças manuais passou a seleção LOW/HIGH para a entrada no percurso. O servidor determina a relação e a localização confirmada. A interface acompanha o snapshot, inclusive após reconexão e após pedidos recusados. |
| Economia e objetivo | Uma vitória vale um ponto. Normal termina aos 15. Demo na interface usa três. O teste de transporte encurta para um ponto para validar uma chegada física e o campeão. O teste das regras percorre as 15 vitórias. O saldo é global por conta, os níveis são por competição/participante/veículo e as recolhas são individuais por ronda. |
| Persistência | Quatro migrações versionadas. Os resultados competitivos são persistentes após confirmação da transação. A sala e a reserva de reconexão são voláteis no reinício do servidor. |

**Correções.** Os atalhos de circuito e terreno passaram a respeitar as restrições dos menus durante o Desafio e online. O seletor local de veículos fica indisponível durante o Desafio ou torneio ativo. A garagem competitiva continua a permitir escolhas entre rondas. A seleção online passa a aguardar o carro e o percurso confirmados. Um comando atrasado já não substitui a relação escolhida pelo servidor. A garagem indica quando uma segunda compra distinta chega durante a primeira transação.

**Arranque e limpeza.** Retirados o tutorial Expo Router, os componentes e as imagens exclusivos do template e o comando de reposição do projeto de exemplo. O build web passou de cinco para quatro rotas exportadas (incluindo duas internas), de oito para seis bundles e de 1353 para 949 módulos Metro no bundle de entrada. As quatro rodas reutilizam geometrias, com transformações independentes. A cena deixou de recalcular o estado do Desafio inativo a cada frame e snapshot. Tempos de abertura, memória e FPS dependem de medição física.

**Verificações executadas.** Lint, TypeScript e compilação do servidor. Testes de física, controlos, interface, áudio, Desafio, autenticação, base de dados, multiplayer, competição individual, torneio local/online, economia local/online, garagem local/online, predição local/online e reconexão. O anfitrião do teste online inicia sessão pelo SDK Supabase e entra na sala com o token devolvido pela fixture HTTP. O percurso é coberto por testes complementares: chegada física e campeão, pirueta com aterragem, moedas/combustível, resultados, compra e aplicação na ronda seguinte.

Os testes exercitaram checkpoints fora de ordem, oscilações e recompensas repetidas, depósito vazio, reenvio após perda de confirmação, identidade e reserva expirada. O teste de garagem mantém a primeira compra à espera de persistência, envia a mesma operação e uma compra diferente, verifica um único débito e um único nível. As quatro migrações, permissões de coluna, RLS, rollback e idempotência passaram em PostgreSQL/PGlite.

**Pendentes.** Faltam credenciais para executar o guião contra Supabase real, confirmação de email entregue por SMTP e duas sessões PostgreSQL independentes em contenção pelo mesmo saldo. O ambiente de teste não disponibilizou IAB, Chrome ou dispositivo físico Expo Go. A exportação web e os testes dos callbacks não medem jogabilidade visual, vibração, áudio real nem a meta de 30 FPS. O README inclui o guião para dois jogadores.

**Exportações verificadas.** O manifesto de `.expo/review-native-export` aponta para bytecode Hermes válido no Android (6 339 409 bytes, 32 referências a recursos) e no iOS (6 109 853 bytes, 28 referências). Todos os ficheiros indicados existem. Na exportação web, as páginas de jogo e de conta referenciam cinco scripts cada, todos presentes, e a rota de tutorial deixou de ser gerada.

## Menu principal e entrada em jogo

A garagem do menu inclui um catálogo de melhorias por veículo com três níveis e preços em moedas. A compra usa a loja autoritária já existente entre rondas, com confirmação do custo, saldo restante, comparação do efeito atual/seguinte e indicação das moedas em falta. A confirmação usa a oferta atual do servidor e fica indisponível se a oferta ou a fase mudar. O saldo continua a ser da conta e os níveis continuam associados ao participante, competição e veículo, conforme a implementação anterior. Preços e efeitos usam `upgradeRules`. Validação com Supabase real e inspeção em Expo Go físico continuam pendentes.

As quatro pré-visualizações da garagem foram renderizadas em WebGL no Edge com os modelos Three.js da pista, a posição dos eixos por veículo e a compressão estática da suspensão. A revisão visual corrigiu a moldura do Serra 4×4, as junções da carroçaria dos dois todo-o-terreno, a curvatura do vidro do Vale Rally e o perfil dos três pneus com piso. A garagem continua a usar imagens estáticas. A exportação web e os testes de física, incluindo dimensões das rodas, trocas de modelo e voltas com os quatro carros, passaram. Falta a inspeção visual em Expo Go físico.

No menu principal, **Garagem** abre um carrossel de ecrã inteiro. Arrastar o carro ou usar as setas percorre os quatro modelos em ciclo. **Concluir** regressa ao menu com o veículo apresentado. O gesto no Expo Go físico aguarda validação.

A rota inicial mostra os modelos dos quatro carros em imagens estáticas, o seletor de percurso, o perfil, o saldo disponível, os tempos pessoais de competição e as definições. A consulta de tempos só é pedida ao abrir o painel. **Jogar** abre a rota de condução. **Lobby** permite autenticar e escolher uma sala antes de carregar o jogo. A cena reutiliza a ligação estabelecida pelo lobby. Os recordes locais do Desafio da Serra sobrevivem à saída para o menu durante a sessão.

No Edge, a abertura do menu apresentou zero canvas e zero pedidos do módulo da cena. Selecionar Vale Rally e premir **Jogar** abriu o circuito com esse veículo, um canvas e o módulo carregado. Os alvos táteis em 390 × 844 no navegador mediram pelo menos 44 píxeis de altura. A exportação web separa a cena num módulo de aproximadamente 1,1 MB. No Expo Go o adiamento aplica-se à inicialização dos recursos do jogo. A verificação em telemóvel físico e a entrada pelo novo menu numa sala com contas Supabase reais continuam pendentes.

## Próximos pedidos

1. Consultar este documento, o estado do Git e o código afetado antes de editar; preservar trabalho local anterior.
2. Implementar o âmbito pedido reutilizando os módulos atuais e documentar parâmetros novos. Preservar as colisões online e os 30 checkpoints do desafio.
3. Executar sempre lint e typecheck; acrescentar verificações existentes relevantes para o que mudou (física, desafio, áudio, multiplayer, exportação web).
4. Atualizar este documento no mesmo pedido: funcionalidades entregues, parciais/em falta, versões se mudarem, resultados das verificações e configurações/testes pendentes.
5. Para alterações futuras de física partilhada ou protocolo, planear cliente e servidor com versões compatíveis e testar colisões antes de publicar. O protocolo atual é 10; as colisões existentes foram mantidas.
