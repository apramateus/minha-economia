// Custo para viver: o plano de cada categoria (em árvore, como na aba Gastos) × o que saiu de verdade.
// Cada número que o usuário pôs mora numa linha só: a pasta mostra a soma; o plano posto na própria pasta fica na linha
// "(geral)" dentro dela (como no diagrama). Clicar no plano edita na linha (na pasta, o próprio dela, na "(geral)"); a soma fica
// mais apagada que o plano posto à mão. Real em verde = dentro do plano, em vermelho = bem acima. Arrastar (mouse) põe uma pasta
// dentro de outra (ou tira, pela faixa do topo); botão direito (no toque, segurar o dedo) dá as opções da categoria (renomear, tipo,
// juntar ali mesmo, excluir…); "+ Nova categoria" cria na hora. No celular, as colunas ficam sem o "R$" e o recuo por nível é menor.
// No cabeçalho da árvore: mostrar a etiqueta do tipo (desligado por padrão, a mesma preferência da aba Gastos) e abrir/fechar todas.
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as MouseEventReact } from 'react';
import { Banknote, ChevronLeft, ChevronRight, Folder, Plus, Tag, TriangleAlert } from 'lucide-react';
import { useDados } from '../lib/estado';
import { isoMes, mesesAnteriores, nomeMesCurto } from '../lib/datas';
import { brl0, lerValor, valorParaCampo } from '../lib/formato';
import { descendentes, linhasVisiveis, type LinhaVisivel } from '../lib/categorias';
import { custoEssencial, custoEssencialReal, mediaRealPorLinha, r2, totalNatureza } from '../lib/calculos';
import { NAO_PLANEJADO } from '../lib/analise';
import { ramoDe } from '../lib/fluxo';
import type { Config, LinhaOrcamento, Natureza } from '../lib/tipos';
import { corDoNo } from '../components/fluxo/FluxoGastos';
import { useMenuDaCategoria, useOperacoesCategorias } from '../components/AcoesCategoria';
import { AreaDeArrastar, BotaoAbrirFecharTodas, FaixaTirarDe, useArrastar, useCategoriaArrastavel } from '../components/Arrastar';
import { useJuntar } from '../components/Juntar';
import { useMenuContexto } from '../components/Menu';
import { Ajuda, Alternador, Card, EtiquetaTipo, IconeComportamento, TituloPagina, useMostrarTipo } from '../components/ui';

const CHAVE_FECHADAS = 'custo.fechadas';

const TIPOS: { id: Natureza | null; nome: string }[] = [
  { id: null, nome: 'Todos' },
  { id: 'fixo', nome: 'Fixos' },
  { id: 'flexivel', nome: 'Flexíveis' },
  { id: 'pontual', nome: 'Pontuais' },
];

/** O real diante do plano: bem acima (vermelho), dentro (verde) ou nada a dizer. */
type Situacao = 'acima' | 'dentro' | null;

interface Total {
  plano: number;
  real: number;
  /** sem contar os pontuais (o plano deles é a média; um mês não diz nada) */
  situacao: Situacao;
}

/** Real bem acima do plano: mais de 10% e pelo menos R$ 20. */
const acimaDoPlano = (plano: number, real: number) => real > plano * 1.1 && real - plano >= 20;

/** Bem acima do plano, ou dentro dele (só quando há plano). */
function situacao(plano: number, real: number): Situacao {
  if (acimaDoPlano(plano, real)) return 'acima';
  return plano > 0 && real <= plano + 0.005 ? 'dentro' : null;
}

/** A soma de uma pasta é consequência do que está dentro: fica mais apagada que o plano posto à mão. */
const SOMA = 'font-semibold opacity-60';

/** Largura e letra das colunas plano e real: no celular, mais estreitas e menores (para o nome caber). */
const COLUNA = 'w-20 shrink-0 max-lg:w-12 max-lg:text-xs';

/** Valor sem centavos; no celular sem o "R$" (no app, valor sem moeda é sempre R$). */
function Reais({ valor }: { valor: number }) {
  const [antes, depois = ''] = brl0(valor).split(/R\$\s?/);
  return (
    <>
      {antes}
      <span className="max-lg:hidden">R$&nbsp;</span>
      {depois}
    </>
  );
}

/** Plano e real de cada categoria somando as de dentro; com `natureza`, só as desse tipo contam. */
function totaisNaArvore(c: Config, real: Record<string, number>, natureza: Natureza | null): Map<string, Total> {
  const porId = new Map(c.orcamento.map((l) => [l.id, l]));
  const r = new Map<string, Total>();
  for (const l of c.orcamento) {
    let plano = 0;
    let gasto = 0;
    let planoSemPontual = 0;
    let gastoSemPontual = 0;
    for (const id of descendentes(c, l.id)) {
      const d = porId.get(id);
      if (!d || (natureza && d.natureza !== natureza)) continue;
      const g = real[id] ?? 0;
      plano += d.valor;
      gasto += g;
      if (d.natureza !== 'pontual') {
        planoSemPontual += d.valor;
        gastoSemPontual += g;
      }
    }
    // pasta com pontual: verde só se o total que aparece também não passou do plano
    const s = situacao(planoSemPontual, gastoSemPontual);
    r.set(l.id, { plano: r2(plano), real: r2(gasto), situacao: s === 'dentro' && gasto > plano + 0.005 ? null : s });
  }
  return r;
}

type Edicao = { id: string; campo: 'nome' | 'plano'; nova?: boolean };

/** `de`: a página de onde veio (o Voltar leva de volta para ela); sem = Orçamento */
export function Custo({ navegar, de }: { navegar: (r: string) => void; de?: string | null }) {
  const voltar = de === 'gastos' ? { rota: 'gastos', nome: 'Gastos' } : { rota: 'orcamento', nome: 'Orçamento' };
  const { dados } = useDados();
  const { config, transacoes } = dados;
  // o real é o mês passado (é ele que conta nos meses de liberdade); 2 e 3 meses ficam para comparar
  const [n, setN] = useState<'1' | '2' | '3'>('1');
  const meses = useMemo(() => mesesAnteriores(isoMes(), Number(n)), [n]);
  const periodo = meses.length === 1 ? nomeMesCurto(meses[0]) : `${nomeMesCurto(meses[0])} a ${nomeMesCurto(meses.at(-1)!)}`;

  return (
    <div className="space-y-3">
      <button onClick={() => navegar(voltar.rota)} className="-mb-1 flex items-center gap-0.5 px-1 text-sm font-semibold text-accent-strong">
        <ChevronLeft size={16} /> {voltar.nome}
      </button>
      <TituloPagina>Custo para viver</TituloPagina>

      <Card>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted">Plano</div>
            <div className="tabular text-xl font-semibold">{brl0(custoEssencial(config))}</div>
            <div className="text-xs text-muted">por mês</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-muted">
              {n === '1' ? 'Real' : 'Real (média)'}
              <Ajuda>
                O que saiu das contas conectadas (pago em dinheiro ou em outro banco aparece como R$ 0). Os pontuais (IPVA, dentista…) entram
                pela média do plano, para um mês de gasto grande não distorcer.
              </Ajuda>
            </div>
            <div className="tabular text-xl font-semibold">{brl0(custoEssencialReal(config, transacoes, meses))}</div>
            <div className="text-xs text-muted">{periodo}</div>
          </div>
        </div>
        <div className="-mb-4">
          <Alternador
            opcoes={[
              { valor: '1', rotulo: 'Mês passado' },
              { valor: '2', rotulo: '2 meses' },
              { valor: '3', rotulo: '3 meses' },
            ]}
            valor={n}
            onMudar={setN}
          />
        </div>
      </Card>

      <AreaDeArrastar chave={CHAVE_FECHADAS}>
        <Arvore meses={meses} navegar={navegar} />
      </AreaDeArrastar>
    </div>
  );
}

/** As categorias em árvore, plano × real. Arrasta, junta e renomeia como as Pastas da aba Gastos. */
function Arvore({ meses, navegar }: { meses: string[]; navegar: (r: string) => void }) {
  const { dados, aviso } = useDados();
  const { config, transacoes } = dados;
  const ops = useOperacoesCategorias();
  const menu = useMenuContexto();
  const { fechadas, setFechadas, acabouDeArrastar, movida } = useArrastar();
  const [natureza, setNatureza] = useState<Natureza | null>(null);
  const [mostrarTipo, setMostrarTipo] = useMostrarTipo();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  // o plano sendo digitado: as somas das pastas acompanham (a ordem das linhas só muda depois de salvar)
  const [rascunho, setRascunho] = useState<{ id: string; valor: number } | null>(null);
  const [juntando, setJuntando] = useState<string | null>(null);
  const modoJuntar = useJuntar(juntando, setJuntando);
  const linhasRef = useRef(new Map<string, HTMLDivElement>());
  // a recém-criada troca de id ao ganhar nome: depois de salvar, é aqui que ela é achada de novo
  const orcamento = useRef(config.orcamento);
  useEffect(() => {
    orcamento.current = config.orcamento;
  });

  // pasta acabou de ser movida para dentro de outra: rola até ela
  useEffect(() => {
    if (movida) setTimeout(() => linhasRef.current.get(movida)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
  }, [movida]);

  const real = useMemo(() => mediaRealPorLinha(config, transacoes, meses), [config, transacoes, meses]);
  const totais = useMemo(() => totaisNaArvore(config, real, natureza), [config, real, natureza]);
  const totaisNaTela = useMemo(() => {
    if (!rascunho) return totais;
    const orc = config.orcamento.map((l) => (l.id === rascunho.id ? { ...l, valor: rascunho.valor } : l));
    return totaisNaArvore({ ...config, orcamento: orc }, real, natureza);
  }, [rascunho, totais, config, real, natureza]);
  const planos = useMemo(() => new Map([...totais].map(([id, t]) => [id, t.plano])), [totais]);
  const linhas = linhasVisiveis(config, fechadas, { valor: planos, natureza });
  const naoPlanejado = real._nao_planejado ?? 0;
  /** o plano próprio entra nas somas (com filtro de tipo, só se for do tipo) */
  const conta = (l: LinhaOrcamento) => !natureza || l.natureza === natureza;
  const editandoPlano = (id: string) => edicao?.id === id && edicao.campo === 'plano';
  // o próprio de uma pasta (plano posto nela ou lançado direto nela) mora na linha "(geral)", logo abaixo dela
  const temGeral = (v: LinhaVisivel) =>
    v.temFilhas && v.aberta && conta(v.linha) && (v.linha.valor > 0 || Math.abs(real[v.linha.id] ?? 0) >= 0.005 || editandoPlano(v.linha.id));

  const alternar = (id: string) =>
    setFechadas((f) => {
      const novo = new Set(f);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  const abrir = (id: string) => navegar(`gastos?ver=${id}`);
  // numa pasta, o plano dela é editado na "(geral)": abre a pasta para ela aparecer
  const editarPlano = (id: string) => {
    setFechadas((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f));
    setEdicao({ id, campo: 'plano' });
  };
  const itensDaCategoria = useMenuDaCategoria({
    onAbrir: abrir,
    onRenomear: (id) => setEdicao({ id, campo: 'nome' }),
    onJuntar: setJuntando,
  });
  const abrirMenu = (e: MouseEventReact, v: LinhaVisivel) => {
    if (juntando) return e.preventDefault();
    const { linha: l, temFilhas: pasta } = v;
    menu.abrir(e, [
      // pasta de outro tipo (com filtro): o plano dela não conta aqui
      ...(!pasta || conta(l)
        ? [{ id: 'plano', rotulo: pasta ? 'Editar plano (geral)' : 'Editar plano', icone: <Banknote size={15} />, onEscolher: () => editarPlano(l.id) }]
        : []),
      ...itensDaCategoria(l.id),
    ]);
  };

  // logo depois de arrastar, o clique não vale; no modo juntar, clicar em qualquer parte da linha escolhe a outra
  const antesDoClique = (e: MouseEventReact, id: string) => {
    if (Date.now() - acabouDeArrastar.current < 400) return e.stopPropagation();
    if (!juntando) return;
    e.stopPropagation();
    modoJuntar.escolherOutra(id);
  };

  const registrar = (id: string) => (el: HTMLDivElement | null) => {
    if (el) linhasRef.current.set(id, el);
    else linhasRef.current.delete(id);
  };

  const nova = async () => {
    const id = await ops.criar(natureza ?? 'flexivel');
    if (id) setEdicao({ id, campo: 'nome', nova: true });
  };

  const nomeFeito = async (id: string, nome: string | null, enter: boolean, recemCriada: boolean) => {
    setEdicao(null);
    const antes = new Set(config.orcamento.map((l) => l.id));
    const atual = config.orcamento.find((l) => l.id === id)?.nome;
    if (nome?.trim() && nome.trim() !== atual) await ops.editar(id, { nome: nome.trim() });
    if (!recemCriada || !enter) return;
    const agora = orcamento.current;
    const achada = agora.some((l) => l.id === id) ? id : agora.find((l) => !antes.has(l.id))?.id;
    if (achada) setEdicao({ id: achada, campo: 'plano' });
  };

  const planoFeito = (id: string, texto: string | null) => {
    setEdicao(null);
    setRascunho(null);
    const l = config.orcamento.find((x) => x.id === id);
    if (texto === null || !l) return;
    const v = texto.trim() ? lerValor(texto) : 0;
    if (v === null || v < 0) return aviso(`"${texto.trim()}" não é um valor`, 'erro');
    if (r2(v) !== l.valor) ops.editar(id, { valor: r2(v) });
  };

  const edicaoDoPlano = (id: string): EdicaoPlano => ({
    editando: editandoPlano(id),
    onEditar: () => editarPlano(id),
    onTexto: (t) => {
      const v = t.trim() ? lerValor(t) : 0;
      setRascunho(v === null || v < 0 ? null : { id, valor: r2(v) });
    },
    onFim: (t) => planoFeito(id, t),
  });

  return (
    <>
      <section className="overflow-clip rounded-2xl border border-borda bg-surface">
        {modoJuntar.faixa}
        <FaixaTirarDe />
        <div className="p-2">
          <div role="radiogroup" aria-label="Comportamento" className="mb-2 grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
            {TIPOS.map((t) => (
              <button
                key={t.nome}
                type="button"
                role="radio"
                aria-checked={natureza === t.id}
                onClick={() => setNatureza(t.id)}
                className={`min-w-0 rounded-lg px-1 py-1.5 text-center transition max-lg:px-0.5 ${
                  natureza === t.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 truncate text-sm font-semibold max-lg:gap-1 max-lg:text-xs">
                  {t.id && <IconeComportamento natureza={t.id} />}
                  {t.nome}
                </div>
                <div className="tabular truncate text-xs">{brl0(t.id ? totalNatureza(config, t.id) : custoEssencial(config))}</div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pr-1 text-xs text-muted">
            <button
              type="button"
              onClick={() => setMostrarTipo(!mostrarTipo)}
              aria-pressed={mostrarTipo}
              title={mostrarTipo ? 'Esconder comportamento' : 'Mostrar comportamento'}
              aria-label={mostrarTipo ? 'Esconder comportamento' : 'Mostrar comportamento'}
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg max-lg:size-10 ${
                mostrarTipo ? 'bg-accent-weak text-accent-strong' : 'text-muted hover:bg-surface-2 hover:text-ink-2'
              }`}
            >
              <Tag size={15} />
            </button>
            <BotaoAbrirFecharTodas />
            <span className="flex-1" />
            <Ajuda rotulo="De onde vem o plano">
              A pasta mostra a soma do que está dentro dela. O plano posto na própria pasta fica na linha “(geral)”, logo abaixo dela (para
              pôr um: clique no número da pasta).
            </Ajuda>
            <span className={`${COLUNA} px-1 text-right`}>plano</span>
            <span className={`${COLUNA} text-right`}>real</span>
          </div>

          {/* recuo por nível: 18 px; no celular, 12 */}
          <div role="tree" aria-label="Categorias" className="[--recuo:12px] lg:[--recuo:18px]">
            {linhas.map((v) => {
              const l = v.linha;
              const emEdicao = edicao?.id === l.id ? edicao : null;
              const cor = corDoNo({ ramo: ramoDe(config, l.id), profundidade: v.nivel + 1 });
              return (
                <Fragment key={l.id}>
                  <Linha
                    v={v}
                    total={totaisNaTela.get(l.id) ?? { plano: 0, real: 0, situacao: null }}
                    cor={cor}
                    mostrarTipo={mostrarTipo}
                    editandoNome={emEdicao?.campo === 'nome'}
                    // pasta: clicar na soma edita o próprio dela, na "(geral)" (de outro tipo, com filtro, não conta aqui)
                    plano={!v.temFilhas ? edicaoDoPlano(l.id) : conta(l) ? { ...edicaoDoPlano(l.id), editando: false } : null}
                    origem={juntando === l.id}
                    semArrastar={!!juntando || !!emEdicao}
                    registrar={registrar(l.id)}
                    antesDoClique={(e) => antesDoClique(e, l.id)}
                    onAlternar={() => alternar(l.id)}
                    onAbrir={() => abrir(l.id)}
                    onMenu={(e) => abrirMenu(e, v)}
                    onNome={(nome, enter) => nomeFeito(l.id, nome, enter, !!emEdicao?.nova)}
                  />
                  {temGeral(v) && (
                    <LinhaGeral
                      l={l}
                      nivel={v.nivel}
                      cor={cor}
                      real={real[l.id] ?? 0}
                      plano={edicaoDoPlano(l.id)}
                      antesDoClique={(e) => antesDoClique(e, l.id)}
                      onAbrir={() => abrir(l.id)}
                      onMenu={(e) => abrirMenu(e, v)}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>

          <button
            type="button"
            onClick={nova}
            className="flex h-9 w-full items-center gap-1.5 rounded-lg pl-1 pr-2.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink max-lg:h-10"
          >
            <span className="size-6 shrink-0" aria-hidden />
            <Plus size={16} className="shrink-0" />
            Nova categoria
          </button>

          {!natureza && (
            <button
              type="button"
              onClick={() => abrir(NAO_PLANEJADO)}
              disabled={!!juntando}
              className="mt-1 flex h-10 w-full items-center gap-1.5 rounded-lg border border-warning pl-1 pr-1 text-left text-sm hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="size-6 shrink-0" aria-hidden />
              <TriangleAlert size={16} className="shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate font-medium">Não planejado</span>
              <span className={`${COLUNA} px-1 text-right text-muted`}>—</span>
              <span className={`tabular ${COLUNA} text-right font-semibold ${naoPlanejado > 0 ? 'text-warning' : 'text-muted'}`}>
                {naoPlanejado ? <Reais valor={naoPlanejado} /> : '—'}
              </span>
            </button>
          )}
        </div>
      </section>

      {menu.menu}
      {modoJuntar.pergunta}
    </>
  );
}

/** Editar um plano na linha: o da folha, ou o próprio da pasta (na "(geral)"). */
interface EdicaoPlano {
  editando: boolean;
  onEditar: () => void;
  onTexto: (texto: string) => void;
  onFim: (texto: string | null) => void;
}

/** Uma categoria. Folha: o plano dela, editável. Pasta: a soma (clicar edita o próprio dela, que fica na "(geral)"). */
function Linha({
  v,
  total,
  cor,
  mostrarTipo,
  editandoNome,
  plano,
  origem,
  semArrastar,
  registrar,
  antesDoClique,
  onAlternar,
  onAbrir,
  onMenu,
  onNome,
}: {
  v: LinhaVisivel;
  total: Total;
  cor: string;
  /** a etiqueta do tipo depois do nome */
  mostrarTipo: boolean;
  editandoNome: boolean;
  /** null: não edita (pasta de outro tipo, com filtro) */
  plano: EdicaoPlano | null;
  /** a que vai ser juntada (modo juntar) */
  origem: boolean;
  semArrastar: boolean;
  registrar: (el: HTMLDivElement | null) => void;
  /** roda antes dos cliques da linha e de tudo dentro dela (pode barrá-los) */
  antesDoClique: (e: MouseEventReact) => void;
  onAlternar: () => void;
  onAbrir: () => void;
  onMenu: (e: MouseEventReact) => void;
  onNome: (nome: string | null, enter: boolean) => void;
}) {
  const { linha: l, nivel, temFilhas: pasta, aberta } = v;
  const apagada = total.plano === 0 && total.real === 0;
  const arrastar = useCategoriaArrastavel(l, cor, semArrastar);

  return (
    <div
      ref={(el) => {
        arrastar.ref(el);
        registrar(el);
      }}
      {...arrastar.props}
      role="treeitem"
      tabIndex={-1}
      aria-level={nivel + 1}
      aria-expanded={pasta ? aberta : undefined}
      onClickCapture={antesDoClique}
      onClick={() => pasta && onAlternar()}
      onContextMenu={onMenu}
      className={`flex h-9 cursor-default select-none items-center gap-1.5 rounded-lg pr-1 text-sm outline-none max-lg:h-10 max-lg:gap-1 ${
        arrastar.alvo || origem ? 'bg-accent-weak ring-2 ring-inset ring-accent' : 'hover:bg-surface-2'
      } ${arrastar.bloqueada || arrastar.arrastando ? 'opacity-40' : ''} ${apagada ? 'text-muted' : ''}`}
      style={{ paddingLeft: `calc(4px + ${nivel} * var(--recuo))` }}
    >
      <span className="flex size-6 shrink-0 items-center justify-center text-muted" aria-hidden>
        {pasta && <ChevronRight size={15} className={`transition-transform ${aberta ? 'rotate-90' : ''}`} />}
      </span>
      <Folder size={16} className={`shrink-0 ${apagada ? 'opacity-50' : ''}`} style={{ color: cor }} fill="currentColor" fillOpacity={0.18} />
      {editandoNome ? (
        <CampoNaLinha inicial={l.nome} rotulo="Nome da categoria" className="min-w-0 flex-1" onFim={onNome} />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {pasta ? (
            <span className={`min-w-0 truncate ${nivel === 0 && !apagada ? 'font-medium' : ''}`}>{l.nome}</span>
          ) : (
            <button type="button" onClick={onAbrir} className={`min-w-0 truncate text-left hover:underline ${nivel === 0 && !apagada ? 'font-medium' : ''}`}>
              {l.nome}
            </button>
          )}
          {mostrarTipo && <EtiquetaTipo natureza={l.natureza} />}
        </span>
      )}

      {plano ? (
        <CelulaPlano rotulo={l.nome} valor={total.plano} inicial={l.valor} soma={pasta} {...plano} />
      ) : (
        <span className={`tabular ${COLUNA} px-1 text-right`}>
          <span className={total.plano ? SOMA : ''}>{total.plano ? <Reais valor={total.plano} /> : '—'}</span>
        </span>
      )}
      <CelulaReal valor={total.real} situacao={total.situacao} soma={pasta} />
    </div>
  );
}

/** O próprio de uma pasta: o plano posto nela e o que foi lançado direto nela (como a folha "(geral)" do diagrama). */
function LinhaGeral({
  l,
  nivel,
  cor,
  real,
  plano,
  antesDoClique,
  onAbrir,
  onMenu,
}: {
  l: LinhaOrcamento;
  /** nível da pasta */
  nivel: number;
  cor: string;
  real: number;
  plano: EdicaoPlano;
  antesDoClique: (e: MouseEventReact) => void;
  onAbrir: () => void;
  onMenu: (e: MouseEventReact) => void;
}) {
  const { bloqueadas } = useArrastar();
  const s = l.natureza === 'pontual' ? null : situacao(l.valor, real);
  return (
    <div
      role="treeitem"
      tabIndex={-1}
      aria-level={nivel + 2}
      onClickCapture={antesDoClique}
      onContextMenu={onMenu}
      className={`flex h-9 cursor-default select-none items-center gap-1.5 rounded-lg pr-1 text-sm outline-none hover:bg-surface-2 max-lg:h-10 max-lg:gap-1 ${
        bloqueadas.has(l.id) ? 'opacity-40' : ''
      }`}
      style={{ paddingLeft: `calc(4px + ${nivel + 1} * var(--recuo))` }}
    >
      <span className="size-6 shrink-0" aria-hidden />
      <Folder size={16} className="shrink-0" style={{ color: cor }} fill="currentColor" fillOpacity={0.18} />
      <span className="flex min-w-0 flex-1">
        <button type="button" onClick={onAbrir} className="min-w-0 truncate text-left hover:underline">
          {l.nome} <span className="text-muted">(geral)</span>
        </button>
      </span>
      <CelulaPlano rotulo={`${l.nome} (geral)`} valor={l.valor} inicial={l.valor} {...plano} />
      <CelulaReal valor={real} situacao={s} />
    </div>
  );
}

/** Plano editável: clicar edita na linha. `valor` = o que aparece; `inicial` = o que o campo traz; `soma`: o da pasta (apagado). */
function CelulaPlano({
  rotulo,
  valor,
  inicial,
  soma,
  editando,
  onEditar,
  onTexto,
  onFim,
}: EdicaoPlano & { rotulo: string; valor: number; inicial: number; soma?: boolean }) {
  if (editando)
    return (
      <CampoNaLinha
        inicial={inicial ? valorParaCampo(inicial) : ''}
        rotulo={`Plano por mês de ${rotulo}`}
        numero
        className="w-20 shrink-0 text-right"
        onTexto={onTexto}
        onFim={(texto) => onFim(texto)}
      />
    );
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEditar();
      }}
      aria-label={`Plano de ${rotulo}: ${brl0(valor)}`}
      className={`tabular ${COLUNA} cursor-text rounded-md px-1 py-0.5 text-right hover:bg-surface hover:ring-1 hover:ring-borda max-lg:self-stretch`}
    >
      <span className={soma && valor ? SOMA : ''}>{valor ? <Reais valor={valor} /> : '—'}</span>
    </button>
  );
}

/** O real: verde dentro do plano, vermelho bem acima. `soma`: linha de pasta (apagada, como o plano dela). */
function CelulaReal({ valor, situacao, soma }: { valor: number; situacao: Situacao; soma?: boolean }) {
  const cor = !valor ? 'text-muted' : situacao === 'acima' ? 'font-semibold text-critical' : situacao === 'dentro' ? 'text-good-text' : '';
  return (
    <span className={`tabular ${COLUNA} text-right ${cor}`}>
      <span className={soma && valor ? SOMA : ''}>{valor ? <Reais valor={valor} /> : '—'}</span>
    </span>
  );
}

/** Campo na própria linha: Enter ou sair salva, Esc cancela (null). */
function CampoNaLinha({
  inicial,
  rotulo,
  numero,
  className,
  onTexto,
  onFim,
}: {
  inicial: string;
  rotulo: string;
  numero?: boolean;
  className: string;
  onTexto?: (texto: string) => void;
  onFim: (texto: string | null, enter: boolean) => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const ref = useRef<HTMLInputElement>(null);
  const feito = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    el.scrollIntoView({ block: 'nearest' });
  }, []);
  const fim = (valor: string | null, enter: boolean) => {
    if (feito.current) return;
    feito.current = true;
    onFim(valor, enter);
  };
  return (
    <input
      ref={ref}
      value={texto}
      inputMode={numero ? 'decimal' : undefined}
      placeholder={numero ? '0' : undefined}
      aria-label={rotulo}
      onChange={(e) => {
        setTexto(e.target.value);
        onTexto?.(e.target.value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') fim(texto, true);
        else if (e.key === 'Escape') fim(null, false);
      }}
      onBlur={() => fim(texto, false)}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className={`tabular -my-1 select-text rounded-md border border-accent bg-page px-1.5 py-0.5 text-sm text-ink outline-none ${className}`}
    />
  );
}
