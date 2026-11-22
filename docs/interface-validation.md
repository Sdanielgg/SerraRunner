# Interface, definições e desempenho

Estado de 21 de novembro de 2026. A interface reutiliza Expo Router, os quatro veículos, as três câmaras, os controlos existentes, Expo Audio e AsyncStorage. Sem novas dependências, projetos nativos ou development builds. Expo instalado **58.0.22**, React Native **0.88.1**, Three **0.162.0**; as restantes versões do plano não mudaram. Foram consultadas as referências do [SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/audio/) e da [API Vibration do React Native](https://reactnative.dev/docs/vibration).

## HUD e acesso

- Condução livre: velocímetro e marcha-atrás no painel dos polegares; sem combustível ou economia. A transmissão é definida pelo percurso selecionado, sem botões LOW/HIGH nem atalhos L/H. A modalidade Circuito continua a ser exploração local, sem alterar tempos históricos.
- Desafio da Serra: tempo, progresso dos **30 checkpoints**, distância ao seguinte e penalização acumulada, incluindo +0 s. Recuperação mantém **+5 s**; melhores tempos por carro na sessão.
- Competição: ronda, pontos/objetivo, saldo em moedas, litros/barra de combustível, rotações completas, prémio pendente de aterragem, dinheiro por guardar, checkpoints e prazo. Zero combustível e necessidade de recuperação têm avisos. O formato compacto reúne saldo/litros numa linha e mantém código/ping na sala para deixar espaço aos comandos. Dinheiro e pontos continuam separados.
- Câmara, Recuperar e Menu têm alvos de pelo menos 48 px. No ecrã compacto, o Desafio e a saída para condução livre estão em Menu. O mesmo menu contém as instruções de todos os modos e o acesso à conta, salas e garagem existentes.
- Safe areas aplicadas nos quatro lados; preferências anteriores de tamanho/lados conservadas. Os painéis de direção, pedais e velocímetro bloqueiam o arrasto da câmara, incluindo os intervalos entre botões. A restante superfície permite arrastar a terceira câmara com outro dedo.
- Cancelar um toque/ponteiro liberta apenas esse identificador. Perda de foco, separador oculto, AppState inativo, saída da rota, menus e trocas de modo limpam comandos, arrasto e buzina. No regresso online, o fluxo de reconexão existente limpa inputs antigos.

## Definições persistentes

`ramp-rivals:settings:v1` em AsyncStorage, no telemóvel e navegador; independente da chave anterior dos controlos. Valores iniciais em `src/game/game-settings.ts`:

| Opção | Inicial | Efeito |
| --- | --- | --- |
| Som | Ligado | Controla motores e buzinas próprios/remotos em todos os modos. Durante a leitura do armazenamento, o áudio fica silenciado. Mantém os quatro sons, tons aleatórios e atenuação por distância. Desligar o motor é imediato; buzinas terminam com o fade curto existente. |
| Vibração | Desligada | Feedback discreto ao recuperar, buzinar e passar checkpoints do Desafio. Usa API RN no Expo Go e `navigator.vibrate` quando disponível na web; o sistema pode ignorar. Não condiciona comandos ou regras. |
| Qualidade | Normal | Reduzida desliga sombras e decoração sem colisões, e reduz distância de desenho. Pistas, barreiras, carros, checkpoints e recolhas mantêm-se. |

Leituras inválidas usam valores iniciais; falhas de armazenamento mostram indicação no menu e conservam a escolha na sessão. Escritas em fila impedem uma alteração rápida antiga de substituir a mais recente. Alterações durante o carregamento são combinadas com os restantes campos guardados. A escrita seguinte tenta guardar também campos anteriormente falhados.

Parâmetros de apresentação em `src/game/interface-config.ts`: HUD a cada **120 ms**, vozes de buzina a cada **50 ms**, vibração **20 ms** com intervalo mínimo de **250 ms**, distância de desenho **280/180 m**, sombras normais **1024²**. iOS escolhe a duração da vibração (cerca de 400 ms); alguns navegadores não disponibilizam esta API. Não foi adicionada dependência nativa. Expo Go e permissões/capacidades reais devem ser confirmados no dispositivo.

## Custo e limpeza de recursos

- Marcações de grelha/setas agrupadas num mesh por material; cada arco competitivo agrupado num mesh. Mantém geometria low poly, materiais e orientação. Não depende de suporte de instancing WebGL.
- Objetos/array vazio de inputs e resultado de frame reutilizados no renderer; HUD só recebe valores primitivos copiados. Velocidade só provoca atualização React quando muda o valor inteiro/marcha. Não atualiza o Desafio em React quando está inativo; estado competitivo continua na cadência reduzida já existente. Renderização/predição continuam independentes do HUD.
- Cor do carro, materiais dos arcos e visibilidade das recolhas só são recalculados quando mudam. Lista de vozes de buzina deixou de ser construída a cada frame.
- Menus completos podem dispensar o desenho GPU mantendo simulação, rede e cronómetro conforme as regras anteriores. App em segundo plano/rota sem foco deixa de renderizar. Não há pausa nova do cronómetro por abrir o menu de condução.
- Gráficos do Desafio são criados à entrada e removidos/dispostos à saída; economia/arcos online são criados quando necessários e libertados ao deixar a sala. Modelos remotos, geometrias/materiais, snapshots e mundo de predição são libertados na saída definitiva. Durante a janela de reconexão, mantêm-se os recursos necessários ao restauro.
- Pista/terreno local e pools de áudio são partilhados e reutilizados, evitando recarregar sons/GL a cada mudança. Vozes antigas são silenciadas ao sair online; os mixers deixam de tocar vozes ausentes. No unmount: RAF, recursos Three/sombras, física/predição, subscrições de teclado/foco/visibilidade/AppState, timers de buzina/áudio, fetches e AudioContexts web e cliente Colyseus são limpos. `useAudioPlayer` gere a libertação dos players nativos ao desmontar.
- Ao abrir a conta, a ligação usa a reserva de reconexão configurada (normal **30 s**) e neutraliza comandos. Se o prazo passar, a sessão da sala expira conforme a política existente. Sem recuperação de sala após reiniciar servidor.

## Evidência automática e limites

`test:interface` usa fixtures dos hosts/hooks para validar persistência, corrida de leitura/escrita, falhas/retry, HUD/instruções e vibração. `test:controls` exercita callbacks nativos/web e isolamento das zonas; não mede geometria final de layout. `test:audio` verifica mute guardado nos quatro motores e vozes remotas, além dos testes anteriores de sons/buzina/distância. `test:physics` usa Cannon real com renderer simulado: compara resultados exatos dos quatro carros ao mudar qualidade durante o Desafio, confirma libertação de gráficos por modo e que saltar desenho não pausa o relógio.

Na cena inicial da fixture, a qualidade normal tem **45 meshes/linhas visíveis na árvore** e a reduzida **31**, além de desativar a passagem de sombras. Isto é contagem estrutural: **não são draw calls medidas na GPU nem FPS**. Frustum, sombras e número de jogadores alteram os valores reais.

Lint/typecheck, build do servidor, testes de interface/controlos/áudio/física/desafio, multiplayer/colisões, predição online e reconexão passaram, além das exportações web/Android/iOS. Os testes de rede usam Colyseus real e fixture Auth HTTP, preservando essa distinção. Bundles móveis em `.expo/interface-native-export`; exportação não equivale a teste físico. A primeira tentativa de Hermes encontrou `permission denied` no sandbox; a execução autorizada do compilador instalado completou os dois bundles.

## Validação manual pendente

Não há telemóvel ligado nem navegador controlável nesta sessão: inventário vazio e IAB/Chrome devolvem `Browser is not available`. A meta de **pelo menos 30 FPS no dispositivo de teste ainda não foi medida**. Não há aprovação audiovisual/física nem validação remota Supabase nova.

| Ambiente | Execução a registar | Estado |
| --- | --- | --- |
| Expo Go Android físico | Modelo, versão Android/Expo Go, resolução e refresh; três modos, quatro carros, três câmaras e ambas as qualidades | Pendente |
| Expo Go iOS físico | Mesmo percurso, safe areas/notch, saída/regresso e vibração definida pelo sistema | Pendente |
| Chrome/Edge desktop | Teclado, ponteiros, blur/tab oculto, Web Audio, persistência após reload | Pendente |
| Navegador móvel | Multitouch com câmara, orientação, safe areas, teclado externo se disponível e vibração suportada | Pendente |

Roteiro a executar em cada dispositivo:

1. Testar direção + acelerador + travão e direção + acelerador + rotação aérea; levantar/cancelar cada dedo, arrastar a câmara fora das zonas, abrir menus com pedais premidos e voltar. Não pode ficar comando preso. Repetir teclado e botões focados com Espaço/Enter. Confirmar alcance dos polegares, fonte aumentada e VoiceOver/TalkBack.
2. Guardar som desligado, vibração ligada e qualidade reduzida. Mudar de modo, abrir/fechar conta, reiniciar/recarregar: escolhas mantêm-se e não há som inicial. Reativar som por gesto, ouvir os quatro carros, buzinas diferentes e aproximação/afastamento de adversários. Validar falha de armazenamento/privacidade quando possível.
3. Percorrer 60 s por modo/qualidade, após aquecimento de 15 s; repetir a competição com quatro jogadores, colisões e salto. Registar média de FPS, percentil 95 do tempo por frame, draw calls/triângulos reais e memória antes/depois de dez mudanças de modo. Usar o monitor de desempenho/JS profiler do Expo Go e ferramentas GPU/browser disponíveis. Documentar modelo, qualidade, câmara e número de participantes. Critério alvo: ≥30 FPS, idealmente p95 ≤33,3 ms; sem prometer esse resultado antes da medição.
4. Verificar que mudança de qualidade não move carro, altera transmissão/combustível, cancela salto ou muda tempo/checkpoints. Confirmar Desafio com 30 checkpoints/+5 s e que dinheiro nunca soma pontos. Confirmar que não há seleção manual de transmissão no ecrã/garagem e que L/H já não alteram a condução.
5. Pôr em segundo plano com aceleração/buzina/arrasto ativos e regressar dentro/depois do prazo de reconexão. Verificar ausência de comandos antigos, áudio em segundo plano, jogadores/recompensas duplicados e crescimento continuado de recursos ao repetir trocas.

Depois de existirem credenciais/configuração, repetir lobby → contagem → corrida → resultados → garagem → nova ronda com Supabase real, incluindo compra/resultado por confirmar e interrupção de rede. As fixtures existentes não substituem essa validação.
