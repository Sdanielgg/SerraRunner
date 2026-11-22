# Ramp Rivals — Competição de 2 a 4 jogadores

## Jogar

1. Iniciar sessão Supabase e criar/entrar na sala por código.
2. No lobby, escolher Serra 4×4, Rocha Crawler, Vale Rally ou Serra GT3. O lobby mostra nome, cor do perfil, veículo, ligação, pronto e pontos.
3. Cada jogador marca **Estou pronto**. Trocar veículo/nome/cor retira o pronto desse jogador; mudar o objetivo ou entrar outro jogador retira o pronto de todos.
4. O anfitrião inicia com pelo menos dois jogadores ligados e todos prontos. O objetivo normal é **15 pontos**; a interface oferece **Demo · 3 pontos**. O servidor aceita objetivos inteiros entre 1 e 15 antes do início. Uma nova competição regressa ao objetivo normal de 15.
5. Todos são colocados nos quatro lugares existentes da grelha. Depois de 3 s começa uma volta ao Circuito da Serra, com cerca de 399,1 m.
6. A ronda termina quando todos chegaram/desistiram ou se esgotaram 180 s de simulação de corrida. Seguem-se resultados e, ao fim de 8 s ou por comando do anfitrião, a garagem. Na garagem podem escolher veículos e marcar pronto para outra ronda.
7. Cada vitória dá **exatamente 1 ponto**. Ao atingir o objetivo, o campeão é anunciado e ficam bloqueadas novas rondas. O anfitrião termina a competição e pode abrir uma nova. Também pode terminar antecipadamente na garagem, sem declarar campeão se ninguém atingiu o objetivo.

Fluxo: **lobby → contagem decrescente → corrida → resultados → garagem → próxima ronda ou fim → novo lobby**.

Dinheiro, melhorias e estatísticas de `player_state` não são lidos nem escritos para calcular pontos. A vitória é uma regra da competição, independente do saldo.

## Regras autoritativas do circuito

- A pista usa `raceSamples`, o comprimento e as barreiras existentes. Há **12 setores e 13 passagens ordenadas**, incluindo partida e meta, configurados em `src/game/circuit-race.ts`. Arcos destacam a próxima passagem no jogo.
- O cronómetro é comum: começa no fim da contagem para todos. A meta é detetada pelo servidor, com interpolação da passagem dentro do passo de física, e só conta após todas as passagens anteriores no sentido correto.
- O servidor verifica o corredor da pista, altura, deslocamento entre passos e continuidade do progresso ao longo da linha central. Sair do corredor, saltar entre setores ou falhar um arco deixa o jogador a precisar de recuperação. Voltar a entrar mais à frente não valida o atalho.
- **Recuperar** (R ou Opções) só reposiciona no último checkpoint validado, com orientação da pista e velocidade reposta. Soma 5 s, tem intervalo mínimo de 2 s e máximo de 10 recuperações por ronda. O destino enviado pelo cliente não é usado durante a corrida. Recuperar não avança checkpoints. Não é permitido recuperar na contagem/resultados ou depois de chegar.
- Trocas de veículo só são aceites no lobby/garagem. O cliente envia comandos de condução; não pode enviar posições, tempos, chegadas, pontos ou vencedores.
- Entre chegadas válidas, vence o menor tempo final, já com penalizações. Em empate exato ao milissegundo, vence o menor ID Supabase em ordem lexicográfica. A ordem de entrada e a iteração dos jogadores não decidem o empate.
- **Sem qualquer chegada válida, não há vencedor nem pontos**, mesmo que reste apenas um jogador ligado. Um jogador que permaneça sozinho depois de outros abandonarem ainda tem de completar uma chegada válida.
- O fecho da ronda atribui o ponto uma única vez. Pacotes repetidos, tentativas de iniciar a ronda errada e repetições de gravação não atribuem mais pontos.

O **Desafio da Serra** continua separado: aproximadamente 845,6 m, **30 checkpoints**, melhores tempos locais da sessão por veículo e +5 s por recuperação. Não se partilham checkpoints entre os dois modos. Condução livre e desafio local continuam sem conta.

## Entradas, anfitrião e reconexões

A sala aceita no máximo quatro jogadores e uma ligação inicial por conta. A primeira ligação é anfitriã. Se sair definitivamente, a função passa para o primeiro membro ainda ligado, conservando a ordem do lobby.

Ao iniciar a competição, `Room.lock()` bloqueia novas entradas durante todas as rondas, resultados, garagem e fim. Há também validação em `onAuth` e `onJoin` para rejeitar reservas iniciadas antes do bloqueio. Um quinto jogador é recusado pela capacidade da sala. Abrir uma nova competição desbloqueia o lobby.

Uma reconexão usa **Colyseus 0.16.26 / colyseus.js 0.16.22**: `allowReconnection(client, seconds)` em `onLeave(client, consented)` e `client.reconnect(room.reconnectionToken)`. Não usa hooks de versões posteriores. A API foi confirmada nas declarações/código instalados e na documentação de [salas v0.16](https://0-16-x.docs.colyseus.io/room) e [cliente v0.16](https://0-16-x.docs.colyseus.io/client).

A janela normal é **30 s**, configurável no servidor por `RECONNECT_WINDOW_SECONDS` (superior a zero, até 300 s). `src/game/reconnection-config.ts` centraliza o valor normal e os intervalos. O servidor comunica a duração ao cliente; o cliente não escolhe a duração da reserva. O prazo no servidor é autoritativo. A reserva mantém o lugar mesmo quando todos estão temporariamente ausentes.

Antes de consumir a reserva, o hook público `verifyClient` do transporte WebSocket verifica no Supabase um token atualizado da **mesma conta** e confere sessão e token Colyseus no jogador reservado. O SDK 0.16 encaminha `client.http.authToken` como Authorization no HTTP e `_authToken` no WebSocket. Uma conta diferente, mesmo com token Colyseus copiado, é recusada antes de assumir o lugar; o token legítimo continua utilizável durante a janela. O código é apenas convite: não autentica, não seleciona outro jogador nem recupera uma sessão expirada. Não registar URLs completas/tokens nos logs; usar HTTPS/WSS fora da rede local.

Durante a ausência, esvaziam-se filas e desligam-se acelerador, direção, rotação aérea e buzina. Aplica-se **travão normal num carro que continua dinâmico**, no mesmo mundo cannon-es: conserva inércia/gravidade, pode ser empurrado e continua a colidir com carros e barreiras. Não fica fantasma ou imóvel artificialmente. Não consome combustível por propulsão. Não ganha checkpoints, chegada ou recolhas; um salto ainda pendente é anulado. Saldos, recolhas feitas, eventos, compras por confirmar, níveis, veículo, pontos e progresso anteriores permanecem no mesmo objeto de jogador.

O relógio da ronda continua. O percurso valida o movimento físico, mesmo sem ligação: atravessar um checkpoint durante a ausência não o atribui e exige recuperação (+5 s); sair do corredor exige recuperação e sair do mundo pode resultar em DNF. O treino individual online conserva a tentativa dentro da janela e conta o tempo da ausência, mas atravessar um setor desligado invalida-a. O Desafio da Serra local não muda.

O regresso autenticado envia estado completo: física/suspensão, combustível/níveis, pontos/progresso, saldo/créditos/recolhas, fase e garagem/compra pendente. Incrementam-se revisão e época de comandos; filas, buzina e comandos locais são limpos. A predição restaura o snapshot antes de aceitar input. Pacotes da época antiga e handlers de um transporte antigo são ignorados. UUIDs de compras, eventos e resultados mantêm-se; não se repetem ações ao anexar o transporte. O token Colyseus roda e o anterior deixa de funcionar.

Em segundo plano, `AppState` liberta comandos e fecha sem consentimento (`room.leave(false)`), conservando o ticket em memória e suspendendo tentativas até regressar ao primeiro plano. O cliente mostra ligação perdida/suspensa, reconexão e segundos restantes, restabelecida apenas após snapshot completo, ou prazo expirado. Repete com backoff limitado enquanto houver prazo; não limita a recuperação a três tentativas. Mudança de conta/logout cancela a reconexão.

O anfitrião conserva a função durante uma ausência temporária. Saída consentida ou expiração liberta o carro e transfere a função para o primeiro membro conectado pela ordem do lobby. Se os restantes estiverem ausentes, fica sem anfitrião até ao primeiro regresso autenticado (ou nova entrada autorizada no lobby). Sem dois participantes ligados/prontos não começa nova ronda; reservas pendentes aguardam regresso/expiração. Uma ronda em curso continua, e um único jogador restante só vence com chegada válida. Sem chegada, nenhum vencedor/ponto. Entradas novas continuam bloqueadas após o início.

**Limites:** sala, reserva e ticket do cliente continuam em memória. Não há recuperação de sala após reinício do servidor, nem restauro do ticket após fechar/recarregar a aplicação. Resultados/compras confirmados no Supabase permanecem; eventos não confirmados podem perder-se ao destruir a sala. Não é anunciada recuperação após reinício.

Cada sala mantém o seu mundo cannon-es, participantes, filas de comandos, fases e pontuação. As colisões entre carros e com as barreiras permanecem no mundo partilhado da respetiva sala.

## Rede e simulação

Os valores previstos no relatório estão implementados e testados em `src/game/network-config.ts`:

| Parte | Implementação |
| --- | --- |
| Física autoritativa | **60 Hz**, um passo fixo de 1/60 s no servidor |
| Snapshots | **20 Hz**, um snapshot a cada três passos |
| Comandos | Capturados em passos fixos a 60 Hz; enviados em lotes a 30 Hz |
| Validação de comandos | Sequência crescente, tipos e LOW/HIGH válidos, máximo de oito comandos por lote e fila limitada; só um comando é aplicado por passo de servidor |
| Carro local | Predição com a mesma física, sem esperar pelo eco da rede |
| Reconciliação | Snapshot inclui confirmação de comandos (incluindo descartados por libertação/reposição), posição, rotação, velocidades, direção e estado das rodas. O cliente restaura esse estado, remove comandos confirmados e repete os restantes |
| Correções | Pequenas correções suavizadas; alterações de revisão por recuperação/troca/teleporte repõem imediatamente o estado e descartam comandos antigos |
| Adversários | Interpolação de posição/rotação com o buffer existente de **80 ms** |
| Contactos previstos | Proxies cinemáticos de adversários próximos ajudam a antecipar contacto; o servidor continua a resolver todas as colisões definitivas |
| Falhas de ligação | Histórico e filas limitados; predição suspensa até novo estado validado após reconectar |

A interface atualiza os detalhes do lobby/HUD a 4 Hz para reduzir renders React; isso não altera os snapshots a 20 Hz nem a física a 60 Hz. A predição não elimina divergências de contacto, jitter ou limites de desempenho do dispositivo: a reconciliação aplica sempre a verdade do servidor.

## Persistência Supabase

Aplicar as quatro migrações por ordem: perfis, rondas, economia e `20261113000400_garage_persistence.sql`.

- `race_rounds` guarda a ronda e participantes, incluindo rondas sem chegada válida. Só os participantes podem ler o registo; clientes não o alteram.
- `competition_results` mantém os dados anteriores, referência da competição/ronda e `points_awarded` (0 ou 1). As novas rondas com garagem usam `serra-circuit-race-v3` e guardam níveis utilizados; os registos v1/v2 são preservados.
- `settle_competition_round` só pode ser chamada pelo servidor. Reutiliza a validação de `record_race_round` e confirma ronda, resultados, ponto, recompensas, saldos, movimentos e estatísticas numa transação.
- Há unicidade por competição/ronda e por resultado de utilizador, além de índice que permite apenas um vencedor por ronda. Repetir a chamada, mesmo com outro UUID de pedido, não volta a inserir resultados ou pontos.
- Se guardar falhar, o anfitrião pode repetir a gravação. A próxima ronda fica bloqueada até confirmar a persistência. Os pontos em memória não são somados de novo durante o retry.

As salas e a competição em curso continuam voláteis: um reinício do processo perde a sala/progresso e qualquer gravação ainda não confirmada. As rondas já confirmadas permanecem no Supabase; não há restauro automático de uma sala após reinício. Credenciais reais, migrações no serviço público e teste Supabase remoto continuam pendentes neste ambiente.

## Verificações

| Teste | Cobertura |
| --- | --- |
| `npm run test:tournament` | 15 rondas/15 pontos, anfitrião/pronto, veículos, empate, tempo limite sem vencedor, fases, recuperação/atalhos e percurso físico válido com os quatro carros |
| `npm run test:tournament:online` | Quatro clientes WebSocket, quinto recusado, sala bloqueada mesmo após saída, reconexão autenticada, cadência real 60/20, sala isolada, lotes de comandos e volta física com recuperação, campeão demo, retry e nova competição |
| `npm run test:prediction` | 30/60/144 fps, resposta imediata, ACK/replay, snapshots antigos, revisão de recuperação, proxies, atraso de 100 ms por sentido e jitter/reordenação simulados |
| `npm run test:prediction:online` | Pipeline real do cliente multiplayer com predição, lotes, ACKs do Colyseus, movimento, travagem e libertação de comandos |
| `npm run test:reconnection` | WebSockets reais com reserva configurável, conta errada sem consumir token legítimo, código sem assumir identidade, estado completo, combustível/níveis/checkpoints/recolhas, época antiga recusada, compra pendente/retry sem duplicados, segundo plano/regresso, expiração, anfitrião e falta de participantes. Janela reduzida só no teste |
| `npm run test:database` | Migrações PostgreSQL/PGlite, RLS, RPC só do servidor, gravação atómica/idempotente, um ponto por vitória e nenhum por ronda sem chegada |
| Testes existentes | Física/colisões, desafio local, áudio, autenticação, salas e treino individual preservados |

Os testes HTTP do Supabase usam fixtures identificadas apenas em `scripts/`; não há autenticação fictícia na aplicação. PostgreSQL/PGlite verifica SQL/RLS/transações, mas não substitui o projeto Supabase real nem concorrência de sessões independentes. Continuam pendentes testes visuais e de desempenho em Expo Go físico, dois dispositivos em redes diferentes e validação no serviço publicado. Compras e histórico têm cobertura adicional em `npm run test:garage` e `supabase/tests/garage-security.sql`.

O protocolo atual é **10**. Publicar cliente e servidor compatíveis em conjunto. Sem alterações de versões ou dependências nativas; não foram usados eject, prebuild ou development builds.

## Economia nas rondas

Q/E e dois botões táteis permitem rotações de pitch só no ar. Voltas completas dão prémio após aterragem validada. Há moedas e combustível individuais por jogador/ronda, consumo por veículo e HUD. Recuperar não cria combustível nem repõe recolhas. A rampa lateral opcional e altura de 16 m mantêm-se na variante v3; corredor/ordem/continuidade e chegada abaixo de 4 m continuam validados. Os créditos são confirmados no fecho atómico da ronda e não contam como pontos. Na garagem, comprar motor/depósito/controlo aéreo para a ronda seguinte; saldo global existente e níveis por participante/competição/veículo. Valores e testes: [economia](race-economy.md) e [garagem/persistência](garage-persistence.md).
