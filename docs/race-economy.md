# Ramp Rivals — Economia da competição

## Âmbito e comandos

A economia aplica-se apenas às rondas multiplayer autenticadas. A condução livre, o treino cronometrado anterior e o Desafio da Serra continuam sem combustível limitado ou recompensas. O desafio conserva os seus 30 checkpoints, tempos por veículo e +5 s por recuperação.

Durante a corrida, **Q / Rodar atrás** e **E / Rodar à frente** aplicam torque de pitch no eixo transversal local do carro. Só atuam sem rodas nem carroçaria em contacto. Os dois comandos opostos anulam-se. Não substituem WASD/setas, acelerador, travão, marcha-atrás, LOW/HIGH ou arrasto da câmara; os dedos são acompanhados individualmente. Libertar um botão aéreo mantém os outros dedos ativos. A física prevista usa os mesmos comandos; a recompensa é sempre calculada pelo servidor.

O circuito existente era plano. A variante económica acrescenta uma **rampa lateral opcional de 2 m**, na reta após a partida, usando os heightfields cannon-es e a mesma triangulação de terreno já utilizada no jogo. A linha central permite contorná-la. O colisor só existe nesta variante, tanto no servidor como na predição. A economia original usa `serra-circuit-race-v2`; as novas rondas com garagem usam `serra-circuit-race-v3`. Todos os resultados anteriores são preservados e o perfil distingue variantes/níveis. Não se comparam silenciosamente tempos obtidos com regras diferentes. Os checkpoints e a continuidade do circuito mantêm-se; a altura permitida é 16 m nesta variante, mantendo a chegada abaixo de 4 m.

## Rotações e aterragem

O servidor mede incrementos de quaternion a 60 Hz no eixo de pitch, conservando o ângulo líquido do salto. Não soma valores absolutos, ângulos de Euler ou oscilações. Só conta voltas completas de 360°, incluindo várias voltas no mesmo salto, até oito. Inverter a rotação reduz a contagem líquida. Uma tolerância final de 0,1 rad só conserva uma volta que já tenha sido completada, para permitir uma pequena correção antes de tocar no chão.

A recompensa fica pendente até validar a aterragem. Regras centralizadas em `src/game/economy-config.ts`:

| Regra | Valor normal |
| --- | --- |
| Prémio | 25 moedas por volta completa; máximo de 200 por salto |
| Armar salto | 0,18 s estável no chão antes de descolar |
| Voo elegível | Pelo menos 0,3 s e 0,35 m de folga sobre o terreno; máximo de 8 s |
| Comando aéreo | Aceleração angular máxima de 30 rad/s²; velocidade alvo de ±10 rad/s |
| Primeiro contacto | Eixo vertical do carro · vertical do mundo ≥0,8; impacto vertical ≤8 m/s |
| Estabilidade | Pelo menos 3 rodas, sem contacto da carroçaria, orientação ≥0,93, velocidade angular ≤1,2 rad/s e vertical ≤1 m/s |
| Confirmação | 0,35 s continuamente estável, dentro de 1,5 s após tocar no chão |

O impacto usa a velocidade descendente anterior ao contacto e os contactos físicos disponíveis. A contagem congela ao primeiro toque de roda. Capotamento, contacto da carroçaria, impacto excessivo, ressalto que volte a deixar todas as rodas no ar, queda abaixo do mapa, recuperação, desconexão ou fim da corrida anulam o salto pendente. A rotação no chão não conta. Um identificador crescente de salto e a máquina de estados impedem pagar duas vezes a mesma aterragem. Uma recuperação não apaga moedas já confirmadas de saltos anteriores.

## Recolhas e combustível

As recolhas são **individuais, uma vez por jogador e por ronda**. Dois jogadores podem recolher a mesma moeda; cada um vê desaparecer apenas as suas recolhas. Recuperar ou reconectar conserva as recolhas utilizadas. Uma nova ronda repõe o conjunto.

Existem oito moedas de 10 e dois depósitos de até 5 L, posicionados em `src/game/economy-course.ts`. Quantidades e validação ficam em `economy-config.ts`: raio de 2,3 m, distância varrida entre posições autoritativas consecutivas e deslocamento máximo de 3 m por passo. Só jogadores ativos e dentro das regras do percurso podem recolher. Após recuperar, as recolhas aguardam 0,5 s. O cliente não tem mensagens para reclamar moedas, combustível ou prémios. Identificadores recolhidos ficam num conjunto no servidor. Depósito cheio não consome a recolha; enchimento parcial utiliza-a uma única vez.

| Veículo | Capacidade | Consumo ao acelerar |
| --- | --- | --- |
| Serra 4×4 | 12 L | 0,08 L/s |
| Rocha Crawler | 18 L | 0,12 L/s |
| Vale Rally | 10 L | 0,10 L/s |
| Serra GT3 | 14 L | 0,18 L/s |

O consumo ocorre ao manter um comando líquido de aceleração ou marcha-atrás sem travão, incluindo no ar e ao limitador; comandos opostos simultâneos não consomem. Uma fração final de combustível fornece a fração correspondente de força nesse passo. A zero, a força de propulsão é zero: direção, inércia, gravidade, travagem e comando aéreo continuam físicos. Recuperar não altera o combustível. Cada nova ronda começa com depósito cheio; a garagem volta às regras de condução livre. O estado autoritativo inclui combustível e contacto das rodas para restauro/replay sem consumo duplicado.

O HUD mostra litros/capacidade, saldo confirmado, crédito a guardar e prémio aéreo pendente. **Moedas não são pontos:** cada vitória continua a valer exatamente 1 ponto, com objetivo normal de 15.

## Persistência e configuração

Aplicar as quatro migrações por ordem, incluindo `20261113000300_race_economy.sql` e `20261113000400_garage_persistence.sql`. Não há novas variáveis nem bibliotecas nativas. Usar [supabase-setup.md](supabase-setup.md); a chave secreta continua exclusivamente no servidor. Publicar cliente e servidor com **protocolo 10** em conjunto.

`economy_events` é protegido por RLS: cada conta lê apenas os seus eventos e nenhum cliente os escreve. Nas novas competições, `settle_competition_round` confirma recompensas, saldo global, movimentos, resultados, pontos e estatísticas numa única transação. `credit_race_rewards` permanece apenas para compatibilidade e recusa créditos separados das novas rondas. A unicidade `(round_id,user_id,event_key)` impede duplicação. Moedas não atribuem pontos nem níveis de melhoria.

O servidor mantém créditos por confirmar durante a corrida e submete-os ao fechar a ronda, juntamente com os resultados. Falhar permite repetir a mesma operação pelo anfitrião. O HUD distingue saldo confirmado de crédito ainda não guardado; garagem/próxima ronda aguardam confirmação. **A fila ainda é volátil:** reiniciar o servidor ou destruir a sala pode perder eventos não confirmados. Não existe fila durável externa. Eventos confirmados permanecem no Supabase e retries não duplicam créditos. Compras, âmbito e estatísticas: [garage-persistence.md](garage-persistence.md).

## Verificação e pendências

- `npm run test:economy`: várias voltas, oscilações/inversão/chão, prémio único após estabilidade, impacto/capotamento/contacto/ressalto/recuperação inválidos; recolhas individuais e repetidas; depósito cheio/parcial, zero combustível e recuperação nos quatro carros; torque só no ar, correspondência rampa/colisor, uma rotação física do Crawler com aterragem paga e ACK/replay de combustível. O teste de salto fixa apenas a velocidade inicial dentro da gama HIGH e usa a física real daí em diante.
- `npm run test:economy:online`: dois clientes Colyseus reais, saldos privados, recolha física, consumo até zero, recuperação sem reabastecer, rejeição de valores de dinheiro/combustível enviados pelo cliente, erro de escrita e retry sem duplicados; timeout sem chegada e sem pontos.
- `npm run test:database`: as quatro migrações e testes de permissões/RLS/RPC em PostgreSQL/PGlite, incluindo `economy-security.sql` e `garage-security.sql`: crédito/fecho atómicos, duplicação, rollback, escrita de saldo proibida e isolamento entre contas.
- Regressões: física/colisões/multitouch/câmara, desafio com os quatro carros, competição, predição, lint/typecheck e exportações web/Android/iOS.

As respostas Auth/Data API nos testes HTTP são fixtures exclusivas de teste. Sem credenciais neste ambiente, aplicar a migração e confirmar a economia num **projeto Supabase real** continua pendente. Também faltam validação visual/ergonómica e afinação dos saltos com os quatro carros em navegador e Expo Go físico, especialmente multitouch com câmara, latência, combustível, colisões e repetição de rondas. Exportar bundles não substitui esses testes. Não foram usados eject, prebuild ou development builds.
