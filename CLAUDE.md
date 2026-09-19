# Minha Economia — instruções para o Claude

App pessoal de finanças: cada pessoa roda o seu, no próprio Mac, com os próprios dados. Tudo em português; **valores sem moeda são sempre R$**.
**Quem usa, as contas e as decisões pessoais estão em `CLAUDE.local.md`** (fora do git; cada instalação tem o seu — leia junto).
O código é público e compartilhado (GitHub `apramateus/minha-economia`; instalar e atualizar: `INSTALAR.md`): nada pessoal no código,
no `seed/`, nos testes ou neste arquivo. Numa instalação que só usa o app, não mude o código — as atualizações chegam por `git pull`.

## Como roda
- `npm run dev` → http://localhost:5180 (só no Mac) · `npm run celular` → também na Wi-Fi (iPhone)
- `npm run abrir` (atalho "Minha Economia.command" na Mesa): sobe com --host, QR no Terminal; iPhone entra por `http://<nome-do-mac>.local:5180`
  (vite `allowedHosts: ['.local']`, `strictPort`). Tela `#/celular` mostra o QR.
- `npm test` (Vitest: cálculos e importadores) · `npm run typecheck`
- Mudou algo em `server/` (API, copiloto, Pluggy)? O Vite **não** recarrega sozinho: reinicie o servidor (fechar e abrir o atalho).
- Stack: Vite + React + TS + Tailwind v4 + Recharts. Sem banco: o plugin `server/api.ts` lê/grava `data/*.json`.

## Dados (`data/`, fora do git)
- **Instalação nova = números de exemplo:** sem `data/`, o app copia o `seed/` (fictício: categorias genéricas, "Salário (exemplo)",
  meta "Reserva de emergência", contas com `demo: true`) e gera 3 meses de lançamentos de exemplo até hoje (`server/demo.ts`,
  `origem: 'demo'`, hash `demo:…`). O Início mostra a etiqueta "Exemplo". A 1ª sincronização real com o banco apaga os lançamentos e
  os itens do patrimônio de exemplo (categorias e metas ficam); `npm run limpar-exemplo` faz o mesmo sem banco.
- `config.json` — `rendaFixa` (lista `{id, nome, valor}` que o usuário informa), `orcamento` (categorias em árvore:
  `pai` = id da categoria de cima ou null, `valor` = plano próprio (pontual: média por mês), `natureza` fixo|flexivel|pontual, `nota`),
  critério de saída, anti-impulso.
- `transacoes.json` — `{id, data AAAA-MM-DD, valor (sempre positivo; estorno de cartão = despesa negativa), tipo despesa|receita|transferencia, linha (id do orçamento; null = NÃO PLANEJADO), fonte (receitas), descricao, conta, origem manual|import|claude|demo, hash}`.
- `metas.json` — metas em cascata + `aportes` (negativo = resgate) + `emprestimoDepois` (onde fica a etapa "Quitar empréstimo":
  logo depois dessa meta; sem = em primeiro). As contas `reserva: true` do patrimônio enchem as metas em ordem.
- `patrimonio.json` — contas e investimentos (saldos), bens, dívidas. (`aReceber` e `snapshots` ainda existem no arquivo, mas o app não usa mais.)
- `regras.json` — categorização por texto (casa no começo de palavra, sem acento/maiúsculas). Primeira que casar vence.
- `desejos.json` — lista de desejos da antiga tela "Posso comprar?" (removida a pedido do usuário; o arquivo continua, sem tela).
- `data/backups/AAAA-MM-DD/` — primeira versão de cada arquivo no dia.

## Regras de negócio que importam
- **Pagamento de fatura, aplicação/resgate = `transferencia`** (não é gasto: o gasto do cartão já entra compra a compra).
- **Renda:** "Renda fixa" = o que o usuário informa (base de sobra/aporte do plano). "Renda média" = o que entrou de verdade (receitas),
  média dos últimos 3 e 12 meses completos (`rendaMedia`), só leitura.
- **"Não planejado" = o vazamento.** É o número mais importante para o usuário; sempre destaque.
- **Tipo de cada categoria = como na Monarch** (decisão do usuário): **Fixo** (todo mês ~igual), **Flexível** (varia), **Pontual** (irregular:
  IPVA, dentista, presentes; o plano é a média mensal). A árvore diz o assunto; o tipo diz o comportamento. Não existe mais "diversão" separada.
  **Na tela o nome é "Comportamento"** (pedido do usuário: "tipo" não dizia nada; no código continua `natureza`), e cada um tem um
  sinal que não é cor (`IconeComportamento` em `ui.tsx`: três barrinhas como três meses — iguais = Fixo, variando = Flexível,
  um pico só = Pontual) nos filtros, na etiqueta, no detalhe e no botão direito.
- **Dois custos:** `custoEssencial` = o PLANO (soma de todas as categorias; base da sobra). `custoReal` = o que saiu no **mês passado** nos fixos +
  flexíveis + não planejado, **mais os pontuais pela média do plano** (decisão do usuário: mês anterior, não média; pontual pela média para um mês
  de IPVA não distorcer) = base dos **meses de liberdade**, do critério de saída e das metas em "meses de custo". Sem dados, cai no plano.
  Sobra para as metas = renda fixa − plano do mês. Orçamento → "Custo para viver" mostra plano × real por tipo.
- **Removidos a pedido do usuário (não recriar sem ele pedir):** meta de pedidos do iFood, "pode gastar hoje", card de diversão no Início,
  botões Guardar e Entrou freela (e a regra do freela), bônus trimestral/imposto na renda, "a receber", critério para sair do emprego,
  gráfico/fechamento mensal do patrimônio, contas do mês e não planejado no Início, aba Categorias (a lista foi para Gastos),
  modo Selecionar, "Dentro de"/conta-boleto/"Vence dia"/"Nova dentro" na edição da categoria, a janela "Regras do plano" do Orçamento
  (`saida.runwayMeses` continua no config e valendo — meta dos meses de liberdade no Início; mudar só por pedido ao Claude/copiloto),
  a tela "Posso comprar?"/Compras (com a regra anti-impulso e o formulário de lançar um gasto à mão: gasto manual agora só pelo
  Claude/copiloto). O iFood é só uma categoria comum.
- **Princípios do usuário para o app inteiro:** essencialista (reduzir mais do que adicionar; simples sem ser raso); **sem texto explicativo
  na tela** — explicação essencial vai num `<Ajuda>` (ícone ?, `src/components/ui.tsx`); **computador primeiro** (menu lateral a partir de
  1024 px, botão direito, hover); o celular é a tradução das mesmas funções para o toque (abaixo).
- **Celular** (abaixo de 1024 px; pedido do usuário: "versão mobile… traduzindo as features"; mudar o celular nunca muda o computador:
  classes base + `lg:` ou `max-lg:`/`pointer-coarse:`). Barra de baixo: Início, Gastos, Extrato, Orçamento, Metas e **Copiloto**
  (o copiloto é uma aba: ocupa a tela até a barra; tocar noutra aba fecha). Dívidas abre pelo Patrimônio.
  **Segurar o dedo = botão direito** (`useToqueLongo` em `Menu.tsx`, ligado no `App`: ~0,5 s parado dispara `contextmenu` no lugar
  tocado, então todo `onContextMenu` do app vale no toque; `data-sem-toque-longo` desliga num elemento). O menu do toque abre como
  **folha embaixo** (submenus descem um nível, com Voltar); o `SeletorCategoria` também. Arrastar categoria não existe no toque:
  "Mover para ▸" no menu (só aparece no toque). Metas arrastam no toque só pela alça ⠿ (segurar o cartão abre o menu).
  Gráfico no toque: pinça/arrastar, toque = zoom no nó, dois toques = "Ver mais", só o botão "Ajustar à tela" (em cima à esquerda).
  Custo para viver no celular: colunas sem "R$". Detalhe da categoria abre numa `Folha`. Alvos de toque de ~40 px.
  `index.css` (`pointer: coarse`): campos com 16 px (o iPhone não dá zoom) e sem seleção de texto/balão do iOS ao segurar.
- **Patrimônio líquido = banco + investimentos − dívidas** (pode ser negativo; "a receber" não entra). É a base dos meses de liberdade.
- **Início** (nota do usuário "tela-de-inicio", na ordem): 1) patrimônio líquido e com os bens ("Ver mais" → `#/patrimonio`: contas e
  investimentos, total das dívidas, bens; a linha "Com os bens" abre direto a lista de bens, `#/patrimonio?secao=bens`), com a
  **meta de patrimônio** como um jogo **só para quem definiu `config.metaPatrimonio`** (sem = não aparece; barra, marcos
  0 → 10 mil → 25 mil → meta, "Próximo marco: … · faltam …"); 2) meses de liberdade; 3) metas (3 primeiras; "Ver mais" → `#/metas`); 4) mês até agora; 5) a categorizar.
  **Início e Orçamento cabem na tela sem rolar** (pedido do usuário): no computador, duas colunas (página `lg:max-w-5xl`).
  Seções (menu lateral no computador, barra embaixo no celular): Início, Gastos, Extrato, Orçamento, Metas, Dívidas (o celular mostra as 5 primeiras + Copiloto).
- **Dívidas** (`#/dividas`, `src/pages/Dividas.tsx`): a fatura do cartão (tipo `fatura`) vem da sincronização e só aparece (sem editar/excluir);
  as outras (empréstimo, outra) o usuário registra: clicar edita, botão direito → Editar/Excluir, excluir com Desfazer. Empréstimo entra
  nas Metas como a etapa "Quitar empréstimo".
- Compra grande paga com dinheiro de meta (ex.: um notebook) → marcar como `transferencia`, não como despesa.

## Banco conectado (Meu Pluggy / Open Finance, somente leitura)
- Credenciais em `.env.local` (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`). **Nunca** leia em voz alta, copie para o chat ou commite esse arquivo.
- Item novo (ex.: conta PJ) vai primeiro em `PLUGGY_ITEM_ID_NOVO`: só entra em `npm run sincronizar -- --novo` (sempre simulação;
  mostra final da conta e item de cada conta — se a PF aparecer de novo, não pode entrar duplicada). Conferido → mover para `PLUGGY_ITEM_IDS`.
- `npm run sincronizar [-- --simular]` (ou botão Atualizar no app; o app também sincroniza sozinho ao abrir se passou de 3h).
- `server/pluggy.ts` orquestra; `src/lib/importar/pluggy.ts` converte (cartão: Pluggy manda compra positiva → invertemos).
  Hash `pluggy:<id>` (o id se mantém de pendente → lançado; mudanças de valor/data são atualizadas sem mexer na categoria).
- 1ª sincronização puxa desde o dia 1º de 3 meses atrás; depois, desde a última transação − 10 dias.
- Mapeamento conta Pluggy → conta do app em `config.pluggy.contas`. Conta nova vira `conta`/`cartao` (as seguintes, `conta-1234`/`cartao-1234`, final do número); as já mapeadas não mudam.
  Saldo BANK → `patrimonio.contas`; saldo CREDIT → dívida `fatura-<conta>`.
- Lançamento do banco movido para o mês a que pertence (ex.: aluguel de setembro pago em 28/08): `data` = a sua, `dataBanco` = a do banco.
  A sincronização só atualiza `dataBanco` (`atualizacaoDoBanco`). O app não edita data/valor (decisão do usuário: ele mostra a informação
  objetiva); ajustes assim só por pedido ao Claude/copiloto, gravando `dataBanco`/`valorBanco`.
  Mesmo esquema para o valor (`valorBanco`): ex.: aluguel de R$ 2.500 = R$ 2.000 de aluguel + R$ 500 de caução (depósito, virou transferência à parte).
- Não duplica o que já veio por CSV/OFX (mesma conta, mesmo valor, até 3 dias) nem o que foi lançado à mão (até 7 dias).
- Pagar contas/transferir: **não fazemos**. O acesso é só leitura e pagamentos ficam com o usuário (débito automático, Pix Automático).

- A sincronização também atualiza: saldo do cartão = o maior entre o saldo e o limite usado (creditLimit − availableCreditLimit;
  há banco que manda saldo 0) e os investimentos de cada item → conta `investimentos-<conta>` (`reserva: false`, não enche metas).
  Ids de instalações antigas (`fatura-c6`, `c6-cdb-cartao`) continuam valendo se já existirem nos dados.
- Itens MeuPluggy não aceitam update manual (a Pluggy atualiza 1×/dia); conta nova exige reconectar na demo = item novo.

## Categorias e regras
- **Árvore do usuário** (`src/lib/categorias.ts`): qualquer categoria pode ficar dentro de qualquer outra; todas são pastas (a de cima mostra
  a soma e pode ter plano/lançamentos próprios, que no diagrama aparecem como "(geral)"). Configs antigos (`grupo`, `config.grupos`, `tipo`/`dia`)
  são migrados ao ler (`migrarConfig` em `server/armazenamento.ts`).
- **Aba Gastos = a casa das categorias**, em duas visões que se alternam (Gráfico | Pastas). Período num ícone de calendário
  (abre as opções e datas livres). **Filtros** num botão que abre uma janela: tipo (Todos/Fixos/Flexíveis/Pontuais, vale para as duas
  visões), "Mostrar categorias sem gasto" (só as Pastas; lembrado em localStorage) e "Mostrar tipo" (etiqueta Fixo/Flexível/Pontual
  depois do nome; desligado por padrão; `useMostrarTipo`, a mesma preferência do Custo para viver). Filtro novo entra nessa janela.
  Nas Pastas, ícone pequeno ao lado de Gráfico|Pastas abre/fecha todas as pastas (`BotaoAbrirFecharTodas`, também no Custo).
  - **Gráfico** (fluxo): um clique dá zoom no nó (inclusive na ponta; clicar numa faixa = no nó dela); clique no vazio tira a seleção; duplo clique ou botão direito → "Ver mais" leva às Pastas
    com a categoria aberta. O gráfico fica montado escondido: voltar mostra ele com o mesmo zoom.
  - **Pastas**: lista à esquerda (`ListaCategorias`: valor gasto no período, maior primeiro; sem gasto = apagadas no fim com "—";
    "Não planejado" no topo; renomear na linha; "+ Nova categoria") e, à direita, sempre o **detalhe** da categoria
    (`DetalheCategoria`: em destaque o **gasto no período** (≈/mês e o plano/mês ao lado); nome, plano, tipo e nota **salvam sozinhos**; "Onde" = estabelecimentos com barra; clicar num abre só o
    essencial: a categoria de todas as compras dele e a lista das compras, cada uma com o seu seletor de categoria). **Arrastar** (`src/components/Arrastar.tsx`, um só DndContext): pasta para dentro de outra (arrastando uma que está dentro
    de outra, a faixa "Tirar de …" no topo da lista mostra os níveis de cima e o nível principal como alvos; o botão direito também tem
    "Tirar de …"), ou um
    estabelecimento/lançamento do detalhe para uma pasta (vira dela; no "Não planejado", fica sem categoria).
  - Deep links: `#/gastos?ver=<id>` abre as Pastas nessa categoria; `#/gastos?juntar=<id>` começa o juntar.
- **Custo para viver** (`#/custo`, o primeiro card do Orçamento, em destaque): árvore de pastas com plano × real (média de 1–3 meses),
  filtro de tipo com o total do plano de cada tipo, "+ Nova categoria", botão direito (Editar plano, Ver mais, …).
  **De onde vem cada plano** (pedido do usuário): a pasta mostra só a soma (negrito, não edita); o plano posto na própria pasta é uma
  linha "<Nome> (geral)" dentro dela (editável, com o real próprio). Cada número que o usuário pôs mora numa linha só.
  Clicar no número da pasta edita o plano dela (abre a "(geral)" já em edição). No cabeçalho da árvore: ícone da etiqueta de tipo
  e abrir/fechar todas. Somas das pastas mais apagadas (consequência);
  real **verde** dentro do plano, **vermelho** acima (> 10% e ≥ R$ 20; sem plano e gasto ≥ R$ 20 também é vermelho).
  Atalho também na barra da aba Gastos ("Custo para viver · R$ X/mês", `#/custo?de=gastos`: o Voltar leva de volta a Gastos).
  Faz o mesmo que as Pastas sem sair da página: arrastar para dentro/para fora ("Tirar de …"), juntar, renomear, excluir.
  Peças compartilhadas com a `ListaCategorias`: `useCategoriaArrastavel` e `FaixaTirarDe` (`Arrastar.tsx`) e o modo juntar (`Juntar.tsx`).
- **Metas**: clicar edita; botão direito ou "⋯" → Editar, Subir/Descer prioridade, Marcar como cumprida, Excluir (com Desfazer);
  **arrastar o cartão muda a prioridade** (a ordem de `metas.metas` = a ordem da cascata; a etapa "Quitar empréstimo", que vem das
  dívidas do tipo empréstimo, também arrasta — `moverNaCascata`/`ordemDaCascata` em `calculos.ts` — e pode ser excluída das metas:
  `metas.semEmprestimo`, a dívida continua em Dívidas); "Cumpridas (N)" recolhidas no fim. **A categorizar**: o mês atual em destaque; os meses anteriores recolhidos embaixo.
- **Botão direito** (`src/components/Menu.tsx`): categoria → Ver lançamentos, Renomear, Tipo ▸, Juntar com…, Excluir
  (`useMenuDaCategoria`); lançamento → Categoria ▸ (árvore em cascata), Editar… (`useMenuDoLancamento`), no Extrato, A categorizar e detalhe;
  estabelecimento no detalhe → Categoria ▸ (todos os lançamentos dele), Ver lançamentos.
- **Juntar** (`juntar`/`mesclar`): "Juntar com…" põe a lista em modo "clique na outra"; depois uma pergunta só, "Qual nome fica?"
  (nome de uma, da outra, ou outro nome). Fica a do nome escolhido (com lugar e tipo dela); lançamentos, regras, plano e as de dentro vão
  para ela. **Excluir** (`excluir`): as de dentro sobem um nível; os lançamentos vão para a de cima (ou voltam para "a categorizar").
  Juntar, excluir e mudar categoria pelo menu agem na hora, com **Desfazer** no aviso (`useOperacoesCategorias`).
- **A categorizar** (`#/categorizar`, card no Início e atalho no Extrato): gasto importado sem categoria válida e sem `editado`.
  Não planejado que o usuário já conhece (ex.: encargos do cartão, seguro) fica com `editado: true` e sai da lista.
  **Descartar** (pedido do usuário, para gastos antigos que ele nem lembra): ✕ no grupo/lançamento, botão direito ou "Descartar todos"
  em "Antes de <mês>" → `editado: true` sem categoria, com Desfazer; continua no Não planejado do mês dele (aparece em Gastos).
- Regra pode ter faixa de valor (`valorMin`/`valorMax`): ex. `FARMACIA ≥ 150 → remedio` acima de `FARMACIA → farmacia`.
- Transação com `editado: true` (você mudou a categoria à mão) nunca é reclassificada.
- **Abrir um lançamento** (Extrato, A categorizar, detalhe → clique ou "Abrir…"): só leitura (descrição, valor, data, conta — sem editar
  nem excluir: decisão do usuário) + a **categoria** (gasto: `SeletorCategoria` com "Transferência" e "Nova categoria…"; entrada: de onde
  veio). Escolher já salva, com Desfazer. No que veio do banco, **"Lembrar da próxima vez"** (padrão de `sugerirPadrao`) → regra no topo de
  `regras.json` + move os parecidos não editados. Não há mais formulário de lançar (botão Lançar e "Posso comprar?" removidos a pedido do usuário).
- **`SeletorCategoria`** = um botão tipo select com a escolhida ("Casa › Luz"); clicar abre a árvore (`MenuFlutuante`), com submenus que
  abrem ao passar o mouse (no toque, desce nível a nível); "Não planejado" em cima. Versão `compacto` dentro de listas.
- Depois de criar regras: `npm run recategorizar -- --simular` e depois sem `--simular`.
- **Diagrama de fluxo** (Sankey em árvore, como a referência do usuário): GASTOS → categorias → subcategorias → ponta, num canvas
  com zoom/arraste (botão esquerdo ou o do meio)/pinça (`src/components/fluxo/FluxoGastos.tsx`, d3-zoom; lógica pura e testada em `src/lib/fluxo.ts`). Estabelecimentos
  via `nomeEstabelecimento`, que lê o descritor de cartão 22+13+país.
  Cor por ramo (`--cat-1..6` em `src/index.css`, paleta validada; `ramoDe` dá a mesma cor na lista); não planejado em cima, cor de alerta.

## Copiloto (chat dentro do app)
- `server/copiloto.ts`: o app chama `claude -p` (Claude Code headless, **assinatura do usuário**, sem API key) nesta pasta,
  com `--permission-mode dontAsk`, `--resume <sessão>` e `--append-system-prompt` (instruções do copiloto).
- **Nada muda sem o OK do usuário** (pedido dele): cada pedido copia `data/*.json` para uma cópia de trabalho
  (`data/backups/propostas/<id>/`, e `<id>-base/` = como estava) e o copiloto só pode alterar essa cópia (Edit/Write nela; os scripts npm
  gravam nela via `MINHA_ECONOMIA_DADOS`, em `server/armazenamento.ts`). O que mudar vira uma **proposta**: cartão "Quer aplicar?" com
  resumo (`resumoDaMudanca`) e OK/Descartar. OK (`/api/copiloto/aplicar`) = mescla de três vias com o que o usuário mudou enquanto isso
  (`mesclar3` em `src/lib/mescla.ts`; mexeram os dois no mesmo lugar → 409 com os conflitos, nada aplicado) + foto em
  `data/backups/copiloto/<carimbo>/` para o Desfazer (restaura só os arquivos aplicados). Guarda as últimas 20 propostas.
- Permissões: ler tudo (menos `.env*`), alterar só a cópia de trabalho, Bash só `npm run resumo|recategorizar|sincronizar|importar`, WebSearch/WebFetch.
- **Tela** (`src/components/Copiloto.tsx`): no computador, painel fixo à esquerda logo depois do menu (o conteúdo anda para a direita
  e continua usável); recolhe/abre pelo menu, pelo cabeçalho ou ⌘J; largura ajustável na borda (320–640 px). Histórico de conversas
  (cada uma com a sua sessão `--resume`), sugestões conforme a tela, resposta chegando aos poucos, passos recolhíveis, Copiar/Refazer.
  No celular, é a última aba da barra de baixo (tela cheia até a barra). Elementos fixos (avisos) se centralizam com a variável CSS `--margem-app` (menu + copiloto).
- Se você estiver rodando COMO copiloto: respostas curtas para celular, altere só a cópia de trabalho que as instruções indicam,
  termine com "Proposta: …" (o usuário aprova ou descarta), não mexa em código.

## Tarefas comuns
- **Importar fatura/extrato CSV/OFX:** `npm run importar -- importar/<arquivo> [--conta <id da conta>] [--simular]`. Rode com `--simular` primeiro e mostre o resumo.
- **Importar PDF ou print:** leia o arquivo, monte um CSV no formato da fatura do C6 (`Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)`, valores positivos = compras) em `importar/`, e rode o importador acima. Assim o hash/dedup continua valendo.
- **Categorizar não planejados:** proponha regras novas para `data/regras.json` (no topo da lista) e atualize o campo `linha` das transações afetadas; confirme com o usuário antes de gravar.
- **Analisar o mês:** `npm run resumo -- AAAA-MM` e depois comente: não planejado (maiores itens), categorias estouradas, o que resta do plano do mês, previsão das metas. Tom direto e sem julgamento.
- O servidor não precisa estar parado para editar `data/*.json`; o app recarrega ao voltar o foco.
