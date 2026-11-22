# Ramp Rivals — Garagem e persistência

## Âmbito escolhido

O saldo já era **global por conta**, em `player_state.balance`. Foi preservado: não é reiniciado nem copiado para cada competição. Duas competições da mesma conta usam a mesma carteira, protegida por bloqueio da linha na base de dados.

Não existiam compras nem uma regra de âmbito para os níveis. As novas melhorias pertencem a **participante + competição + veículo** (`vehicle_upgrades`). Trocar de veículo mostra os níveis desse veículo; regressar ao anterior recupera-os. Uma nova competição começa com níveis zero, conservando o saldo da conta. O JSON legado `player_state.upgrades` permanece intacto e não é reinterpretado. As estatísticas acumulam por conta em `profile_statistics`, associada ao perfil; o JSON legado `player_state.statistics` também é preservado.

O modo local, treino individual e Desafio da Serra continuam com a física base, sem aplicar compras. Os 30 checkpoints, melhores tempos da sessão e +5 s do desafio não mudam. As novas rondas usam `serra-circuit-race-v3`; os resultados anteriores e identificadores v1/v2 são preservados. Cada resultado novo guarda os níveis utilizados. O perfil distingue as variantes e mostra os níveis, sem apresentar tempos de regras diferentes como equivalentes.

## Compra entre rondas

1. A ronda termina e o servidor congela o resultado, níveis usados e eventos económicos de cada participante.
2. Uma única transação confirma resultados, +1 ponto ao vencedor, recompensas, saldo, movimentos e estatísticas. Sem chegada válida, nenhum ponto; recompensas válidas continuam a ser guardadas.
3. O servidor confirma a fase de garagem no Supabase. O menu Online mostra saldo, níveis, preço e efeito do próximo nível do veículo escolhido.
4. Com Pronto cancelado, comprar motor, depósito ou controlo aéreo. A interface aguarda a confirmação; não aumenta níveis nem desconta saldo por antecipação.
5. O anfitrião inicia a próxima ronda quando todos estão prontos e as operações anteriores estão confirmadas. O servidor bloqueia a fase na base de dados e lê os níveis confirmados; só então inicia a contagem e equipa os carros.

Os carros na garagem mantêm a física base. As melhorias não alteram uma ronda em curso. O estado serializado transporta níveis e combustível para a mesma predição/reconciliação a 60/20 Hz, conservando colisões e interpolação dos adversários.

## Valores configuráveis

`src/game/upgrades.ts` é a configuração tipada de apresentação e física. `upgrade_catalog`, criado pela quarta migração, é a configuração autoritativa de preços, efeitos e limites no SQL. Um teste compara ambos; o servidor recusa carregar um catálogo incompatível. Alterar regras exige nova migração, incremento da versão do catálogo e publicação compatível. O limite é o comprimento da lista de preços.

| Melhoria | Preços dos níveis 1 / 2 / 3 | Efeito por nível, a partir da base |
| --- | --- | --- |
| Motor | 40 / 70 / 110 moedas | +10% da força de motor base em LOW e HIGH |
| Depósito | 30 / 60 / 100 moedas | +25% da capacidade base do veículo |
| Controlo aéreo | 30 / 55 / 90 moedas | +20% da aceleração angular base |

Os efeitos são lineares: base × (1 + nível × incremento), sem multiplicação cumulativa sobre um valor já melhorado. O motor conserva limites de velocidade, marcha-atrás, direção, travões e diferenças LOW/HIGH de cada carro. O depósito conserva o consumo próprio. O controlo aéreo conserva velocidade angular máxima, restrição ao ar e critérios de aterragem. Massa, dimensões, suspensão, aderência e apoio aerodinâmico mantêm os valores originais. Recuperar conserva combustível e níveis; a próxima ronda começa com a capacidade confirmada cheia.

## Dados e atomicidade

Aplicar **as quatro migrações por ordem**, incluindo `20261113000400_garage_persistence.sql`. Não há dependências ou variáveis novas; usar [supabase-setup.md](supabase-setup.md). Cliente e servidor passam ao **protocolo 10**.

| Tabela | Responsabilidade |
| --- | --- |
| `competitions` | Identidade, anfitrião, objetivo, fase persistida, ronda ativa e campeão |
| `competition_participants` | Conta, veículo escolhido, participação ativa e pontos acumulados da competição |
| `race_rounds` | Rondas confirmadas, participantes, classificação e vencedor; dados anteriores preservados |
| `competition_results` | Chegadas válidas, percurso, veículo, ponto atribuído e níveis usados |
| `player_state` | Saldo global existente; campos legados preservados |
| `vehicle_upgrades` | Níveis por competição/conta/veículo |
| `upgrade_catalog` | Preços, incrementos e versão autorizados |
| `economy_events` | Eventos económicos únicos, incluindo os históricos |
| `money_movements` | Créditos e débitos com operação única, competição, veículo e saldo confirmado do lote |
| `profile_statistics` | Rondas, chegadas, vitórias, campeonatos, recuperações e moedas ganhas/gastas acumuladas |

A migração preenche movimentos históricos sem voltar a creditar dinheiro e calcula estatísticas a partir das rondas/resultados/eventos existentes. Perfis novos recebem estatísticas iniciais por trigger. Rondas futuras não contam novamente um participante que já tinha saído definitivamente antes da partida. Uma desconexão durante a ronda continua a contar como participação/DNF.

`purchase_vehicle_upgrade` só é executável pelo servidor. Bloqueia primeiro a competição e depois a carteira; verifica participação ativa, garagem sem campeão, catálogo, nível esperado, limite e saldo. O preço vem do catálogo SQL. Débito, incremento do nível, movimento e estatística de gasto partilham a mesma transação. Um pedido simultâneo com o nível antigo é recusado. Compras noutras competições da mesma conta também disputam o mesmo saldo de forma serializada.

As ofertas têm UUID emitido pelo servidor. A unicidade do movimento torna a repetição idempotente, incluindo quando a primeira compra foi guardada mas a resposta se perdeu. A reutilização do UUID com outra identidade/competição/veículo/melhoria é recusada. O cliente nunca escolhe o utilizador, preço ou nível efetivo; o servidor usa a identidade Supabase validada e a oferta emitida.

`settle_competition_round` bloqueia a competição, reutiliza a validação de chegada/desempate e grava tudo numa transação: ronda, resultados, ponto, créditos, saldos, movimentos e estatísticas. Uma falha em qualquer participante faz rollback de todos. Unicidade por competição/ronda e por evento impede repetições, mesmo com outro UUID de pedido. O campeão e a estatística de campeonato são atribuídos uma vez. Os pontos em memória/HUD são provisórios enquanto a gravação aparece pendente.

Para satisfazer essa atomicidade, os créditos da corrida deixam de ser gravados isoladamente a cada segundo: aparecem como **a guardar** até fechar a ronda. A rotina antiga de crédito não pode creditar rondas das novas competições fora da transação de fecho. Moedas continuam sem contar como pontos.

RLS permite ler apenas saldo, melhorias, movimentos, estatísticas e participação próprios; a competição só é visível aos participantes. Catálogo é legível por contas autenticadas. Não há permissões de escrita direta do cliente nem acesso às RPCs de compra, transição ou fecho. As chaves secretas permanecem só no servidor.

## Falhas e histórico

Falhar o arranque persistido congela a contagem; o anfitrião repete a mesma transição. Falhar o fecho mantém a ronda pendente e bloqueia compras/próxima ronda. Uma compra com resultado de rede incerto conserva o UUID e bloqueia Pronto, troca de veículo e fim até confirmar a mesma operação. Uma rejeição SQL definitiva não altera o estado e permite atualizar a garagem. Níveis só chegam à física após confirmação do arranque seguinte.

Em **A minha conta**, carregar resultados e **Carregar saldo, estatísticas e histórico**. São mostrados até 20 resultados, rondas, movimentos, participações e conjuntos de melhorias. Os dados são lidos do Supabase com o token da conta sob RLS, incluindo depois de novo login.

**Limite atual:** a simulação/sala e operações ainda não confirmadas continuam em memória. Reiniciar o processo não restaura uma competição em curso nem uma fila de recompensas ainda não submetida. Compras e rondas confirmadas permanecem no Supabase; perder uma resposta não desfaz a transação e repetir não a duplica. Não há fila durável externa nem restauro de sala após reinício.

## Verificações e pendências

- `npm run test:garage`: efeitos físicos nos quatro carros, LOW/HIGH, depósito, torque aéreo, serialização e regresso à física base; clientes Colyseus reais com ofertas, fase, duplicados, resposta de compra/ronda perdida após commit, ausência de confirmação antecipada, troca de veículo, próxima ronda e nova competição.
- `npm run test:database`: quatro migrações em PostgreSQL/PGlite, igualdade do catálogo, compra única, saldo insuficiente, nível desatualizado/máximo, participação, fase, RLS, escrita/RPC do cliente proibidas, fecho atómico com rollback entre participantes, campeão único e preservação de âmbito.
- Regressões: economia, física/colisões/câmara/multitouch, quatro veículos no Desafio da Serra, salas, autenticação, competição, predição, lint/typecheck e exportação web/Android/iOS.

Não existem credenciais Supabase reais neste ambiente. Continuam pendentes aplicar as migrações num projeto de teste, repetir os SQL em `supabase/tests/`, confirmar compras simultâneas através de sessões PostgreSQL independentes/Data API, saldos e histórico após novo login e falhas de rede reais. PGlite valida SQL/transações/RLS, mas não substitui concorrência e serviço remotos. Também faltam validação visual/ergonómica e desempenho em Expo Go físico e navegador. Não foram usados eject, prebuild ou development builds.
