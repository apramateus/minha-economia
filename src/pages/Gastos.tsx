// Para onde o dinheiro foi, em duas visões que se alternam. Gráfico: o fluxo em árvore (um clique dá zoom; duplo clique
// ou "Ver mais" leva para as pastas). Pastas: as categorias à esquerda e, à direita, os detalhes da escolhida — com o mouse,
// os itens arrastam para outra pasta. Voltar ao gráfico mostra ele onde estava. No celular, o detalhe abre numa folha.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, Folder, Network, SlidersHorizontal, Target } from 'lucide-react';
import { useDados } from '../lib/estado';
import { dataCurta, isoDia } from '../lib/datas';
import { brl0 } from '../lib/formato';
import { gastoNaArvore, mesesNoPeriodo, NAO_PLANEJADO, periodoDoPreset, type Periodo, type Preset } from '../lib/analise';
import { arvoreDeGastos, type NoFluxo } from '../lib/fluxo';
import { filhas } from '../lib/categorias';
import { custoEssencial } from '../lib/calculos';
import type { Natureza, Transacao } from '../lib/tipos';
import { FluxoGastos } from '../components/fluxo/FluxoGastos';
import { ListaCategorias } from '../components/ListaCategorias';
import { DetalheCategoria } from '../components/DetalheCategoria';
import { AreaDeArrastar, BotaoAbrirFecharTodas } from '../components/Arrastar';
import { useMenuDaCategoria } from '../components/AcoesCategoria';
import { useMenuContexto, type ItemMenu } from '../components/Menu';
import { Entrada, Folha, IconeComportamento, useComputador, useMostrarTipo } from '../components/ui';

const PRESETS: { id: Exclude<Preset, 'datas'>; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes-passado', rotulo: 'Mês passado' },
  { id: '3m', rotulo: 'Últimos 3 meses' },
  { id: '6m', rotulo: 'Últimos 6 meses' },
  { id: 'tudo', rotulo: 'Tudo' },
];

const TIPOS: { id: Natureza | null; rotulo: string }[] = [
  { id: null, rotulo: 'Todos' },
  { id: 'fixo', rotulo: 'Fixos' },
  { id: 'flexivel', rotulo: 'Flexíveis' },
  { id: 'pontual', rotulo: 'Pontuais' },
];

type Visao = 'grafico' | 'pastas';

interface Aberta {
  id: string;
  soProprios?: boolean;
  focarNome?: boolean;
}

function lerLocal<T extends string>(chave: string, validos: readonly T[], padrao: T): T {
  try {
    const v = localStorage.getItem(chave) as T | null;
    return v && validos.includes(v) ? v : padrao;
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* navegação privada: tudo bem */
  }
}

/** Caminho do total até um nó (para a trilha "Todas › Casa › …"). */
function caminhoAte(raiz: NoFluxo, id: string): NoFluxo[] | null {
  if (raiz.id === id) return [raiz];
  for (const f of raiz.filhos) {
    const c = caminhoAte(f, id);
    if (c) return [raiz, ...c];
  }
  return null;
}

export function Gastos({ editar, ver, juntar }: { editar: (t: Transacao) => void; ver?: string | null; juntar?: string | null }) {
  const { dados } = useDados();
  const { config, transacoes } = dados;
  const hoje = isoDia();
  const computador = useComputador();
  const [preset, setPreset] = useState<Preset>(() => lerLocal('gastos.preset', ['mes', 'mes-passado', '3m', '6m', 'tudo', 'datas'] as const, 'mes'));
  const [datas, setDatas] = useState<Periodo>(() => periodoDoPreset('mes', hoje));
  const [natureza, setNatureza] = useState<Natureza | null>(null);
  const [visao, setVisao] = useState<Visao>(() => (ver || juntar ? 'pastas' : lerLocal('gastos.visao', ['grafico', 'pastas'] as const, 'grafico')));
  const [foco, setFoco] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Aberta | null>(() => (ver ? { id: ver } : null));
  const [juntando, setJuntando] = useState<string | null>(juntar ?? null);
  const [mostrarTipo, setMostrarTipo] = useMostrarTipo();
  const [esconderVazias, setEsconderVazias] = useState(() => lerLocal('gastos.vazias', ['mostrar', 'esconder'] as const, 'mostrar') === 'esconder');
  const menu = useMenuContexto();

  useEffect(() => gravarLocal('gastos.preset', preset), [preset]);
  useEffect(() => gravarLocal('gastos.visao', visao), [visao]);
  useEffect(() => gravarLocal('gastos.vazias', esconderVazias ? 'esconder' : 'mostrar'), [esconderVazias]);

  const periodo = preset === 'datas' ? datas : periodoDoPreset(preset, hoje, transacoes);
  const raiz = useMemo(() => arvoreDeGastos(config, transacoes, periodo, natureza), [config, transacoes, periodo.de, periodo.ate, natureza]);
  const trilha = foco ? caminhoAte(raiz, foco) : null;
  const nao = raiz.filhos.find((f) => f.id === NAO_PLANEJADO)?.valor ?? 0;
  const meses = mesesNoPeriodo(periodo);

  // na visão Pastas sempre tem uma categoria aberta: sem escolha, a de maior gasto (o não planejado, se houver)
  const padrao = useMemo(() => {
    const g = gastoNaArvore(config, transacoes, periodo, natureza);
    if (!natureza && (g.get(NAO_PLANEJADO)?.valor ?? 0) > 0) return NAO_PLANEJADO;
    return [...filhas(config, null)].sort((a, b) => (g.get(b.id)?.valor ?? 0) - (g.get(a.id)?.valor ?? 0))[0]?.id ?? null;
  }, [config, transacoes, periodo.de, periodo.ate, natureza]);
  const atual: Aberta | null = aberta ?? (computador && padrao ? { id: padrao } : null);

  const abrir = useCallback((id: string) => {
    setJuntando(null);
    setAberta({ id });
  }, []);
  const fechar = useCallback(() => setAberta(null), []);
  const comecarJuntar = useCallback((id: string) => {
    setAberta(null);
    setJuntando(id);
    setVisao('pastas');
  }, []);
  const verMais = useCallback((id: string, soProprios = false) => {
    setJuntando(null);
    setAberta({ id, soProprios });
    setVisao('pastas');
  }, []);
  const itensDaCategoria = useMenuDaCategoria({
    onAbrir: (id) => verMais(id),
    onRenomear: (id) => {
      setAberta({ id, focarNome: true });
      setVisao('pastas');
    },
    onJuntar: comecarJuntar,
  });

  const verMaisNo = (no: NoFluxo) => {
    if (no.tipo === 'nao-planejado') return verMais(NAO_PLANEJADO);
    if (no.categoria) verMais(no.categoria, no.tipo === 'geral');
  };
  const menuNo = (no: NoFluxo, e: React.MouseEvent) => {
    const itens: ItemMenu[] = no.categoria
      ? itensDaCategoria(no.categoria)
      : [{ id: 'abrir', rotulo: 'Ver mais', onEscolher: () => verMais(NAO_PLANEJADO) }];
    menu.abrir(e, itens);
  };

  const detalhe = atual && (
    <DetalheCategoria
      key={`${atual.id}${atual.soProprios ? '#geral' : ''}`}
      id={atual.id}
      soProprios={atual.soProprios}
      focarNome={atual.focarNome}
      periodo={periodo}
      natureza={natureza}
      editar={editar}
      onFechar={fechar}
      onJuntar={comecarJuntar}
      semFechar={computador}
    />
  );

  return (
    <AreaDeArrastar>
    <div
      className="flex flex-col gap-3 lg:h-[calc(100dvh-3.5rem)]!"
      style={{ height: 'calc(100dvh - env(safe-area-inset-top) - 1.25rem - 4.4rem - env(safe-area-inset-bottom))' }}
    >
      {/* no celular, em grade: título e total; o período na largura toda; o não planejado e a média embaixo */}
      <header className="flex items-start justify-between gap-3 px-1 max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:items-baseline max-lg:gap-y-0.5">
        <div className="min-w-0 max-lg:contents">
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <SeletorPeriodo
            className="max-lg:col-span-2 max-lg:row-start-2"
            preset={preset}
            periodo={periodo}
            datas={datas}
            onPreset={(p) => {
              setPreset(p);
              setFoco(null);
            }}
            onDatas={(d) => {
              setDatas(d);
              setPreset('datas');
              setFoco(null);
            }}
          />
        </div>
        <div className="shrink-0 text-right max-lg:contents">
          <div className="tabular text-2xl font-bold tracking-tight max-lg:col-start-2 max-lg:row-start-1">{brl0(raiz.valor)}</div>
          {meses > 1.3 && <div className="tabular text-xs text-muted max-lg:col-start-2 max-lg:row-start-3">≈ {brl0(raiz.valor / meses)}/mês</div>}
          {nao > 0 && (
            <div className="flex items-center justify-end gap-1 text-xs text-ink-2 max-lg:col-start-1 max-lg:row-start-3 max-lg:justify-start">
              <AlertTriangle size={12} className="text-warning" /> {brl0(nao)} não planejado ({Math.round((nao / Math.max(1, raiz.valor)) * 100)}%)
            </div>
          )}
        </div>
      </header>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Segmentado
            rotulo="Ver como"
            opcoes={[
              { valor: 'grafico', rotulo: 'Gráfico', icone: <Network size={14} className="-rotate-90 max-lg:size-[17px]" /> },
              { valor: 'pastas', rotulo: 'Pastas', icone: <Folder size={14} className="max-lg:size-[17px]" /> },
            ]}
            valor={visao}
            onMudar={(v) => setVisao(v as Visao)}
          />
          {visao === 'pastas' && <BotaoAbrirFecharTodas />}
        </div>
        <div className="flex items-center gap-2">
          {/* atalho para o plano de gasto de cada categoria */}
          <a
            href="#/custo?de=gastos"
            className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink-2 max-lg:h-10"
          >
            <Target size={14} />
            Custo para viver
            <span className="tabular hidden font-normal sm:inline">· {brl0(custoEssencial(config))}/mês</span>
          </a>
          <PainelFiltros
            natureza={natureza}
            onNatureza={(n) => {
              setNatureza(n);
              setFoco(null);
            }}
            esconderVazias={esconderVazias}
            onEsconderVazias={setEsconderVazias}
            mostrarTipo={mostrarTipo}
            onMostrarTipo={setMostrarTipo}
          />
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* o gráfico continua montado na visão Pastas: voltar mostra ele com o mesmo zoom */}
        <div className={`absolute inset-0 ${visao === 'grafico' ? '' : 'pointer-events-none invisible'}`} aria-hidden={visao !== 'grafico'}>
          <FluxoGastos raiz={raiz} foco={foco} onFoco={setFoco} onVerMais={verMaisNo} onMenu={menuNo} />
          {trilha && trilha.length > 1 && (
            <nav
              className="absolute left-2 top-2 flex max-w-[calc(100%-4rem)] items-center gap-1 overflow-x-auto whitespace-nowrap rounded-full border border-borda bg-surface/95 py-1 pl-1 pr-3 text-sm shadow-sm max-lg:min-h-10"
              aria-label="Ramo aberto"
            >
              <button
                onClick={() => setFoco(trilha.length > 2 ? trilha.at(-2)!.id : null)}
                className="flex shrink-0 items-center rounded-full p-0.5 text-accent-strong hover:bg-surface-2 max-lg:p-1.5"
                aria-label="Voltar um nível"
              >
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setFoco(null)} className="shrink-0 font-semibold text-accent-strong">
                Todas
              </button>
              {trilha.slice(1).map((n, i, arr) => (
                <span key={n.id} className="flex shrink-0 items-center gap-1">
                  <span className="text-muted">›</span>
                  {i === arr.length - 1 ? (
                    <span className="font-semibold">{n.nome}</span>
                  ) : (
                    <button onClick={() => setFoco(n.id)} className="font-semibold text-accent-strong">
                      {n.nome}
                    </button>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {visao === 'pastas' && (
          <>
            <div className="absolute inset-0 lg:grid lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-4">
              <ListaCategorias
                periodo={periodo}
                natureza={natureza}
                selecionada={atual?.id ?? null}
                onAbrir={abrir}
                juntando={juntando}
                onJuntando={(id) => (id ? comecarJuntar(id) : setJuntando(null))}
                esconderVazias={esconderVazias}
                mostrarTipo={mostrarTipo}
              />
              {computador && detalhe && <div className="h-full overflow-y-auto rounded-2xl border border-borda bg-surface p-5">{detalhe}</div>}
            </div>
            {!computador && (
              <Folha aberta={!!aberta} titulo="Categoria" onFechar={fechar} semCabecalho>
                {detalhe}
              </Folha>
            )}
          </>
        )}
      </div>

      {menu.menu}
    </div>
    </AreaDeArrastar>
  );
}

/** Estado de um painel que abre embaixo de um botão e fecha ao clicar fora ou com Esc. */
function useAbertoAteClicarFora() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAberto(false);
    };
    document.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [aberto]);
  return [aberto, setAberto, ref] as const;
}

/** Filtros num botão: tipo (vale para o gráfico e as pastas) e mostrar ou não as categorias sem gasto. Filtro novo entra aqui. */
function PainelFiltros({
  natureza,
  onNatureza,
  esconderVazias,
  onEsconderVazias,
  mostrarTipo,
  onMostrarTipo,
}: {
  natureza: Natureza | null;
  onNatureza: (n: Natureza | null) => void;
  esconderVazias: boolean;
  onEsconderVazias: (v: boolean) => void;
  mostrarTipo: boolean;
  onMostrarTipo: (v: boolean) => void;
}) {
  const [aberto, setAberto, ref] = useAbertoAteClicarFora();
  const ativos = [natureza ? TIPOS.find((t) => t.id === natureza)?.rotulo : null, esconderVazias ? 'sem vazias' : null].filter(Boolean);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold max-lg:size-10 max-lg:justify-center max-lg:px-0 ${
          ativos.length ? 'bg-accent-weak text-accent-strong' : 'bg-surface-2 text-muted hover:text-ink-2'
        }`}
      >
        <SlidersHorizontal size={14} className="max-lg:size-[17px]" />
        {/* no celular, só o ícone (com filtro ligado, fica colorido) */}
        <span className="max-lg:sr-only">Filtros</span>
        {ativos.length > 0 && <span className="font-normal max-lg:sr-only">· {ativos.join(' · ')}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-borda bg-surface p-3 shadow-2xl">
          <div className="mb-1.5 text-xs font-semibold text-ink-2">Comportamento</div>
          <div className="grid grid-cols-2 gap-1">
            {TIPOS.map((t) => (
              <button
                key={t.rotulo}
                type="button"
                onClick={() => onNatureza(t.id)}
                aria-pressed={natureza === t.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm max-lg:py-2.5 ${natureza === t.id ? 'bg-accent text-white' : 'hover:bg-surface-2'}`}
              >
                {t.id && <IconeComportamento natureza={t.id} />}
                {t.rotulo}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2.5 border-t border-borda pt-3">
            <Interruptor rotulo="Mostrar categorias sem gasto" ligado={!esconderVazias} onMudar={(v) => onEsconderVazias(!v)} />
            <Interruptor rotulo="Mostrar comportamento" ligado={mostrarTipo} onMudar={onMostrarTipo} />
          </div>
        </div>
      )}
    </div>
  );
}

function Interruptor({ rotulo, ligado, onMudar }: { rotulo: string; ligado: boolean; onMudar: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm max-lg:min-h-10">
      {rotulo}
      <input type="checkbox" className="sr-only" checked={ligado} onChange={(e) => onMudar(e.target.checked)} />
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${ligado ? 'bg-accent' : 'bg-surface-2'}`} aria-hidden>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${ligado ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </label>
  );
}

/** O período fica num ícone: clicar abre as opções (e as datas livres). */
function SeletorPeriodo({
  preset,
  periodo,
  datas,
  onPreset,
  onDatas,
  className = '',
}: {
  preset: Preset;
  periodo: Periodo;
  datas: Periodo;
  onPreset: (p: Preset) => void;
  onDatas: (d: Periodo) => void;
  className?: string;
}) {
  const [aberto, setAberto, ref] = useAbertoAteClicarFora();
  const livre = preset === 'datas' ? datas : periodo;
  const nome = PRESETS.find((p) => p.id === preset)?.rotulo;
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label="Período"
        className="-ml-1 flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-ink-2 max-lg:max-w-full max-lg:py-1.5"
      >
        <CalendarDays size={15} className="shrink-0" />
        <span className="max-lg:truncate">
          {nome ? `${nome} · ` : ''}
          {dataCurta(periodo.de)}/{periodo.de.slice(2, 4)} a {dataCurta(periodo.ate)}/{periodo.ate.slice(2, 4)}
        </span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {aberto && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-xl border border-borda bg-surface p-1 shadow-2xl">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPreset(p.id);
                setAberto(false);
              }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm max-lg:py-2.5 ${preset === p.id ? 'bg-accent text-white' : 'hover:bg-surface-2'}`}
            >
              {p.rotulo}
            </button>
          ))}
          <div className={`mt-1 grid grid-cols-2 gap-2 rounded-lg border-t border-borda p-2 pt-3 ${preset === 'datas' ? 'bg-accent-weak/40' : ''}`}>
            <label className="text-xs text-muted">
              De
              <Entrada type="date" value={livre.de} max={livre.ate} onChange={(e) => e.target.value && onDatas({ ...livre, de: e.target.value })} className="px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-muted">
              Até
              <Entrada type="date" value={livre.ate} min={livre.de} onChange={(e) => e.target.value && onDatas({ ...livre, ate: e.target.value })} className="px-2 py-1.5 text-sm" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Segmentado({
  rotulo,
  opcoes,
  valor,
  onMudar,
}: {
  rotulo: string;
  opcoes: { valor: string; rotulo: string; icone?: React.ReactNode }[];
  valor: string;
  onMudar: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-xl bg-surface-2 p-0.5" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          aria-pressed={valor === o.valor}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold max-lg:h-9 max-lg:w-10 max-lg:justify-center max-lg:px-0 ${
            valor === o.valor ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2'
          }`}
        >
          {o.icone}
          {/* no celular, só o ícone: não cabe tudo numa linha */}
          <span className="max-lg:sr-only">{o.rotulo}</span>
        </button>
      ))}
    </div>
  );
}
