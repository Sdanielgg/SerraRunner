# Ramp Rivals — Configurar autenticação e resultados

A integração chama o Supabase real; não existe modo de autenticação simulada na aplicação ou no servidor. Sem configuração, o jogo local funciona, a conta apresenta a configuração em falta e as salas online recusam ligações. Os testes HTTP usam exclusivamente uma fixture em `scripts/`, nunca um substituto em produção.

## 1. Projeto e migrações

Cria ou seleciona um projeto Supabase de teste. Aplica, por ordem, `20261113000100_profiles_and_results.sql`, `20261113000200_multiplayer_rounds.sql`, `20261113000300_race_economy.sql` e `20261113000400_garage_persistence.sql`. A quarta acrescenta competições/participantes, garagem, movimentos, estatísticas e fecho atómico. Todas preservam dados anteriores. Podes executar o SQL no SQL Editor como administrador. Com Supabase CLI, liga o projeto e usa `supabase db push`, conforme a [documentação de migrações](https://supabase.com/docs/guides/local-development/database-migrations). Regista a aplicação das migrações e usa novas migrações para alterações posteriores.

A migração cria:

| Tabela | Acesso do cliente autenticado |
| --- | --- |
| `profiles` | Ler apenas o próprio perfil; atualizar apenas `display_name` e `vehicle_color` |
| `player_state` | Ler apenas o próprio estado; sem escrita de saldos, melhorias ou estatísticas |
| `competition_results` | Ler apenas os próprios resultados; sem inserção, edição ou remoção pelo cliente |
| `race_rounds` | Ler apenas rondas em que participou; sem escrita pelo cliente |
| `economy_events` | Ler apenas as próprias recompensas; nenhuma escrita pelo cliente |
| `competitions` | Ler apenas competições em que participou; sem escrita pelo cliente |
| `competition_participants`, `vehicle_upgrades`, `money_movements`, `profile_statistics` | Ler apenas dados próprios; sem escrita pelo cliente |
| `upgrade_catalog` | Catálogo legível por contas autenticadas; configuração só do servidor/admin |

Um trigger em `auth.users` cria perfil e estado inicial. Só importa nome e cor dos metadados; ignora saldos, melhorias e estatísticas enviados no registo. Utilizadores preexistentes recebem registos iniciais, sem alterar as suas identidades. O trigger valida nome (2–20 caracteres, sem caracteres de controlo) e cor hexadecimal; metadados inválidos recebem os valores por defeito. Atualizações posteriores inválidas são rejeitadas pela base de dados.

RLS limita as linhas; permissões por coluna limitam os campos do perfil. A chave do servidor escreve resultados autoritativos. Nenhuma função RPC permite ao cliente escrever dados protegidos.

## 2. Email e confirmação

Em Authentication, ativa o fornecedor Email/Password. Configura uma palavra-passe mínima de **8 caracteres** também no Supabase; o cliente aplica esse mínimo, mas a configuração do fornecedor é a validação autoritativa. Configura SMTP e os limites de envio apropriados ao ambiente.

Se **Confirm email** estiver ativo, o registo mostra o passo de confirmação sem criar uma sessão fictícia. Para confirmar dentro do Expo Go e do navegador, inclui `{{ .Token }}` no template **Confirm signup** do Supabase, por exemplo:

```html
<h2>Ramp Rivals</h2>
<p>O teu código de confirmação é: {{ .Token }}</p>
```

O utilizador introduz esse código em **Confirmar email**; o cliente chama `verifyOtp` com tipo `signup`. **Reenviar confirmação** pede um novo email. Se mantiveres o template com link, o utilizador pode confirmar o link e regressar ao jogo para iniciar sessão com email/palavra-passe. Configura o Site URL/redirecionamento desse link no dashboard. Não é necessário um deep link nativo nem development build para o fluxo por código. Se a confirmação estiver desligada, o cliente aceita a sessão real devolvida pelo registo.

Referências: [Supabase Auth no React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native), [templates de email](https://supabase.com/docs/guides/auth/auth-email-templates).

## 3. Variáveis do cliente

Copia `.env.example` para `.env.local` na raiz:

```dotenv
EXPO_PUBLIC_MULTIPLAYER_URL=https://serrarunner.onrender.com
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA-CHAVE-PUBLICA
```

Usa uma chave **publishable** (`sb_publishable_...`) ou a chave pública `anon` legada. Estas variáveis são incorporadas no bundle e são públicas. Nunca coloques uma chave `sb_secret_...`, `service_role`, palavra-passe da base de dados ou JWT signing secret aqui. Reinicia o Expo depois de alterar as variáveis. Na Vercel, configura as mesmas variáveis públicas antes de exportar/publicar.

No dispositivo, o SDK persiste a sessão em AsyncStorage, incluído no Expo Go SDK 58. No navegador usa o armazenamento local do SDK. O fornecedor de sessão acompanha eventos de autenticação; o cliente renova tokens automaticamente, pausa a renovação nativa em segundo plano e retoma ao regressar. Antes de ligar a uma sala força renovação se faltar menos de um minuto para expirar. A renovação de salas é enviada a cada 45 s e após alterações de sessão/perfil. Os intervalos e timeouts ficam em `src/auth/config.ts`.

Logout remove a sessão deste dispositivo e sai da sala. Se a rede falhar, a remoção local é mantida e a interface informa que a revogação no servidor não foi confirmada. Um JWT já emitido pode manter validade até expirar, conforme o [comportamento do Supabase](https://supabase.com/docs/reference/javascript/auth-signout).

## 4. Variáveis do servidor

Copia `server/.env.example` para `server/.env.local`:

```dotenv
PORT=2567
RECONNECT_WINDOW_SECONDS=30
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=SUA-CHAVE-PUBLICA
SUPABASE_SECRET_KEY=SUA-CHAVE-SECRETA-APENAS-NO-SERVIDOR
```

`SUPABASE_SECRET_KEY` aceita uma chave secret atual ou `service_role` legada. Fica exclusivamente no processo Node. `.env`, `.env.*` e os ficheiros locais do servidor estão ignorados pelo Git; apenas os exemplos vazios são versionados. Não copies as variáveis secretas para a Vercel que exporta o cliente. No Render, configura-as no serviço multiplayer; `render.yaml` declara os nomes com `sync: false`, sem valores.

```sh
npm run server:dev
```

O comando compila o servidor e `server:start` carrega opcionalmente `server/.env.local` pelo suporte de env files do Node (Node >=22.13). Variáveis já definidas pelo alojamento têm prioridade. Cliente e servidor têm de apontar para o **mesmo projeto Supabase**.

Sem URL/chave pública, o servidor recusa autenticação com erro de configuração. Sem chave secreta, pode autenticar salas mas anuncia competições indisponíveis. Não há fallback para convidados nem para resultados guardados apenas em memória apresentados como persistentes.

## 5. Salas e competições

O cliente envia apenas o token de acesso e a escolha do veículo ao criar/entrar numa sala. O servidor chama [`auth.getUser(token)`](https://supabase.com/docs/reference/javascript/auth-getuser) no projeto configurado, consulta o perfil sob RLS com esse token e associa a ligação ao ID devolvido por Auth. Ignora `userId`, nome e cor enviados como opções do cliente. O token nunca aparece nos snapshots.

Nas renovações, um token de outra conta é rejeitado; a identidade da ligação não muda. Tokens expirados desligam o jogador ativo. Uma interrupção reserva o lugar durante 30 s configuráveis; pode renovar o token e voltar com a mesma identidade, mesmo se o anterior expirar durante a ausência. A revalidação ocorre antes de consumir a reserva e não revela dados privados à conta errada. O progresso válido permanece, sem atribuir setores/recompensas durante a ausência; relógios continuam. Regras e limites de reinício em [reconexão multiplayer](multiplayer-competition.md#entradas-anfitrião-e-reconexões).

Em **Online**, o lobby permite uma competição de 2–4 jogadores com rondas, objetivo normal de 15 pontos e demo 3. Cada vitória vale 1 ponto; dinheiro não participa na pontuação. `settle_competition_round` grava ronda, resultados, ponto, recompensas, saldos e estatísticas numa transação idempotente só do servidor. As entradas ficam bloqueadas e há recuperação no último checkpoint. Regras: [competição multiplayer](multiplayer-competition.md).

Antes da primeira ronda, **Treino individual · guardar volta** mantém o modo anterior: o servidor coloca o veículo na grelha existente e conta 3 s. A primeira passagem da linha inicia o tempo. O servidor valida uma volta pelo circuito de aproximadamente 399 m através de 12 setores ordenados e a passagem final; não usa os 30 checkpoints do Desafio da Serra. Todos os carros, barreiras e colisões entre jogadores continuam no mundo cannon-es partilhado.

Repor, trocar de veículo, sair dos limites ou interromper a ligação cancela a tentativa. O tempo é calculado em passos de simulação no servidor; o cliente não envia tempos, posições ou o autor do resultado. Só uma conclusão validada produz uma escrita com UUID do servidor, ID autenticado, veículo e tempo. O estado só passa a **guardado** após a resposta do Supabase.

Se guardar falhar, **Tentar guardar resultado novamente** repete o mesmo UUID sem duplicar o resultado. Enquanto houver um resultado pendente, uma nova tentativa fica bloqueada. O resultado pendente só é mantido na memória da sala: sair definitivamente ou reiniciar o servidor antes de o guardar pode perdê-lo. Não existe fila durável de reenvio nesta versão. Os últimos 20 resultados persistidos podem ser consultados em **A minha conta → Carregar resultados guardados**.

Regras configuráveis: `src/game/competition.ts` define volta, setores, contagem e limite de 600 s. Alterações ao identificador do percurso ou limite máximo também exigem nova migração que ajuste as constraints SQL. Condução livre e Desafio da Serra local permanecem disponíveis sem autenticação e não enviam os seus tempos locais para a base de dados.

O protocolo atual é **10**, incluindo garagem, economia, identidade, fases de competição e ACK/estado de predição. Publica cliente e servidor compatíveis em conjunto. O nome de sala `serra_drive`, URLs, IDs de veículos e colisões foram preservados; a rampa opcional só se ativa nas rondas económicas v2/v3.

As novas rondas usam v3, preservando dados v1/v2. Os créditos ficam a guardar até ao fecho atómico. Na garagem, `purchase_vehicle_upgrade` valida participação, fase, catálogo, nível e saldo; desconta e melhora numa transação com UUID único, só do servidor. Saldo global existente e níveis por participante/competição/veículo; estatísticas acumuladas no perfil. Ver [garagem e persistência](garage-persistence.md). Não há novas variáveis de ambiente.

## 6. Verificar

```sh
npm run lint
npm run typecheck
npm run test:auth
npm run test:database
npm run test:multiplayer
npm run test:competition
npm run test:tournament
npm run test:tournament:online
npm run test:prediction
npm run test:economy
npm run test:economy:online
npm run test:garage
npm run test:reconnection
npm run test:physics
npm run test:challenge
npm run test:audio
npm run web:build
```

`test:auth` verifica validações e o contrato do SDK de sessão usando um servidor HTTP de teste. `test:database` executa a migração e `supabase/tests/security.sql` em PostgreSQL/PGlite, com um esquema Auth mínimo de teste. `test:multiplayer` testa a identidade e renovação em WebSockets reais. `test:competition` conduz uma volta com física real, verifica cancelamento, falha de escrita, retry, autor do resultado, troca de identidade e expiração. As respostas Supabase destes testes são fixtures, não uma verificação do serviço real. PGlite é apenas uma dependência de desenvolvimento.

Antes de considerar o ambiente integrado, validar com credenciais reais:

1. Aplicar as quatro migrações e executar todos os SQL em `supabase/tests/`, incluindo `garage-security.sql`, num projeto de teste isolado. Os testes usam transações com rollback.
2. Registar duas contas reais; confirmar email quando ativo e testar código inválido/expirado e reenvio.
3. Login válido/inválido, recarregar a página, fechar/reabrir Expo Go, renovar a sessão, voltar de segundo plano e terminar sessão, incluindo falhas de rede.
4. Editar nome/cor e confirmar visualmente os veículos; tentar editar outro perfil e dados protegidos via Data API e confirmar rejeição.
5. Entrar na mesma sala a partir de duas contas/dispositivos, confirmar colisões e identidade, completar uma competição e verificar o resultado após novo login.
6. Testar tokens expirados/inválidos, reconexão, indisponibilidade temporária do Supabase e retry sem duplicados.
7. Recolher moedas/combustível e concluir um salto válido; verificar saldo após novo login, rejeição de recolhas repetidas, isolamento entre contas, retry sem duplicação e combustível a zero/recuperação sem reabastecer. Pontos de vitória devem permanecer separados.
8. Comprar na garagem, testar saldo insuficiente, nível máximo e duas sessões independentes a disputar o mesmo saldo. Simular resposta perdida após commit, repetir o UUID e verificar um único débito/nível. Confirmar níveis só na ronda seguinte e histórico/estatísticas após novo login.

Nesta intervenção **não existiam credenciais Supabase no ambiente nem ficheiros locais de configuração**. Migração no projeto real, SMTP/emails, RLS através da Data API, persistência real e validação física em Expo Go continuam pendentes. A exportação de bundles Android/iOS não substitui execução num dispositivo físico.
