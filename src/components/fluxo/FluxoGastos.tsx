// Canvas do diagrama de fluxo: SVG com zoom e arraste (roda, trackpad, pinça), rótulos que aparecem conforme o zoom,
// clicar num nó dá zoom nele e o duplo clique abre os detalhes (no toque: tocar, tocar duas vezes; segurar = botão direito).
// A geometria fica em unidades do desenho e recebe o transform direto (sem re-render do React a cada quadro); os rótulos
// ficam em pixels de tela, com tamanho constante.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact } from 'react';
import { select } from 'd3-selection';
import { zoom as criarZoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import 'd3-transition';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { brl, brl0 } from '../../lib/formato';
import {
  alturaIdeal,
  caixaDoRamo,
  enquadrar,
  layoutFluxo,
  linhasDeRotulo,
  noNoPonto,
  nosEmOrdem,
  trilhaDoNo,
  xDaColuna,
  type NoFluxo,
  type NoPos,
  type Transformacao,
} from '../../lib/fluxo';

const N_CORES = 6;

/** Cor de um nó: o ramo define o tom; quanto mais fundo, mais claro. Não planejado usa a cor de alerta. */
export function corDoNo(no: Pick<NoFluxo, 'ramo' | 'profundidade'>): string {
  if (no.ramo === -1) return 'var(--warning)';
  if (no.ramo < 0) return 'var(--accent)';
  const base = `var(--cat-${(no.ramo % N_CORES) + 1})`;
  const pct = Math.max(52, 100 - 14 * Math.max(0, no.profundidade - 1));
  return pct >= 100 ? base : `color-mix(in oklab, ${base} ${pct}%, var(--surface))`;
}

let contexto: CanvasRenderingContext2D | null = null;
function medir(texto: string, fonte: string): number {
  contexto ??= document.createElement('canvas').getContext('2d');
  if (!contexto) return texto.length * 7;
  contexto.font = fonte;
  return contexto.measureText(texto).width;
}

/** Corta o texto com "…" para caber na largura (em pixels). */
function caber(texto: string, max: number, fonte: string): string {
  if (max <= 0) return '';
  if (medir(texto, fonte) <= max) return texto;
  let a = 0;
  let b = texto.length;
  while (a < b) {
    const m = Math.ceil((a + b) / 2);
    if (medir(`${texto.slice(0, m)}…`, fonte) <= max) a = m;
    else b = m - 1;
  }
  return a > 0 ? `${texto.slice(0, a).trimEnd()}…` : '';
}

/** O nome que uma folha mostra à direita da barra. */
const nomeDaFolha = (no: NoFluxo) => (no.tipo === 'nao-planejado' ? `⚠ ${no.nome}` : no.nome);

/** Duração das animações de zoom. Sem animação com "reduzir movimento" ou com a aba escondida (o navegador pausa os quadros). */
const DURACAO = () => (document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 450);

interface Props {
  raiz: NoFluxo;
  /** ramo em foco (id do nó) ou null = tudo */
  foco: string | null;
  onFoco: (id: string | null) => void;
  /** duplo clique num nó: ver os detalhes da categoria */
  onVerMais: (no: NoFluxo) => void;
  /** botão direito num nó (menu da categoria) */
  onMenu?: (no: NoFluxo, e: React.MouseEvent) => void;
}

export function FluxoGastos({ raiz, foco, onFoco, onVerMais, onMenu }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mundoRef = useRef<SVGGElement>(null);
  const pontosRef = useRef<SVGPatternElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const tRef = useRef<Transformacao>({ k: 1, x: 0, y: 0 });
  const quadro = useRef(0);
  const [t, setT] = useState<Transformacao>({ k: 1, x: 0, y: 0 });
  const [vista, setVista] = useState({ largura: 0, altura: 0 });
  // tamanho usado para montar e enquadrar: só muda com mudança grande (girar o celular, redimensionar a janela),
  // não quando uma folha abre/fecha e a barra de rolagem da página aparece
  const [base, setBase] = useState({ largura: 0, altura: 0 });
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [fonte, setFonte] = useState('system-ui, -apple-system, sans-serif');
  const fonteNome = `500 12px ${fonte}`;
  const fonteValor = `400 11px ${fonte}`;

  const estreita = base.largura > 0 && base.largura < 560;
  const maxProf = useMemo(() => Math.max(1, ...nosEmOrdem(raiz).map((n) => n.profundidade)), [raiz]);
  // no celular o "ajustar" mostra até o 2º nível (o resto aparece ao dar zoom ou tocar num ramo);
  // no Mac, tudo. A altura do desenho acompanha o formato da área, para ocupar a tela.
  const profNaTela = estreita ? Math.min(maxProf, 2) : maxProf;
  // espaço à direita para os rótulos das folhas que chegam na borda. No celular, o do maior deles (até 45% da largura):
  // o enquadramento cabe na largura, sem rótulo cortado
  const margemDireita = useCallback(
    (folhas: NoFluxo[]) => {
      if (!estreita) return Math.min(190, base.largura * 0.4);
      const maior = Math.max(0, ...folhas.map((n) => Math.max(medir(nomeDaFolha(n), fonteNome), medir(`${brl0(n.valor)} · 00%`, fonteValor))));
      return Math.min(Math.max(24, maior + 14), base.largura * 0.45);
    },
    [estreita, base.largura, fonteNome, fonteValor],
  );
  const margens = useMemo(
    () => ({
      topo: 16,
      baixo: 16,
      esquerda: 12,
      direita: margemDireita(estreita ? nosEmOrdem(raiz).filter((n) => !n.filhos.length && n.profundidade === profNaTela) : []),
    }),
    [margemDireita, estreita, raiz, profNaTela],
  );
  const opcoes = useMemo(() => {
    const geometria = { larguraColuna: estreita ? 120 : 190, larguraNo: 8, larguraRaiz: estreita ? 100 : 124 };
    const largura = xDaColuna(profNaTela, geometria) + geometria.larguraNo;
    const area = base.largura
      ? { largura: base.largura - margens.esquerda - margens.direita, altura: base.altura - margens.topo - margens.baixo }
      : { largura: 4, altura: 3 };
    return { ...geometria, larguraAjuste: largura, alturaTotal: alturaIdeal(raiz, largura, area) };
  }, [raiz, profNaTela, estreita, base, margens]);
  const layout = useMemo(() => layoutFluxo(raiz, opcoes), [raiz, opcoes]);

  // ----- tamanho da vista e fonte -----
  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    setFonte(getComputedStyle(el).fontFamily || fonte);
    const ro = new ResizeObserver(([e]) => {
      const v = { largura: e.contentRect.width, altura: e.contentRect.height };
      setVista(v);
      setBase((b) => (Math.abs(b.largura - v.largura) > 60 || Math.abs(b.altura - v.altura) > 60 ? v : b));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- zoom e arraste -----
  const aplicar = useCallback((x: number, y: number, k: number) => {
    tRef.current = { x, y, k };
    mundoRef.current?.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
    pontosRef.current?.setAttribute('patternTransform', `translate(${x % 22},${y % 22})`);
    if (document.hidden) setT({ x, y, k });
    else if (!quadro.current)
      quadro.current = requestAnimationFrame(() => {
        quadro.current = 0;
        setT({ ...tRef.current });
      });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const sel = select(svg);
    const z = criarZoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 60])
      // a roda é tratada à parte (trackpad arrasta, ⌘/ctrl+roda e mouse dão zoom); arrasta com o botão esquerdo ou o do meio (a roda)
      .filter((e: Event) => e.type !== 'wheel' && e.type !== 'dblclick' && ((e as MouseEvent).button ?? 0) <= 1)
      .clickDistance(6)
      .tapDistance(10)
      .on('zoom', (e) => aplicar(e.transform.x, e.transform.y, e.transform.k));
    zoomRef.current = z;
    sel.call(z).on('dblclick.zoom', null);
    // o clique na roda não pode virar a rolagem automática do navegador
    const semAutoRolagem = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    svg.addEventListener('mousedown', semAutoRolagem, true);

    let gesto = false;
    let k0 = 1;
    const ponto = (e: { clientX: number; clientY: number }): [number, number] => {
      const r = svg.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      if (gesto) return;
      const legado = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
      const ehMouse = legado ? legado !== -3 * e.deltaY : e.deltaMode !== 0;
      if (e.ctrlKey || e.metaKey || ehMouse) {
        const f = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.002;
        z.scaleBy(sel, 2 ** (-e.deltaY * f), ponto(e));
      } else {
        const k = tRef.current.k;
        z.translateBy(sel, -e.deltaX / k, -e.deltaY / k);
      }
    };
    // pinça do trackpad no Safari do Mac (no iPhone o d3-zoom já cuida da pinça pelos toques)
    type Gesto = Event & { scale: number; clientX: number; clientY: number };
    const inicio = (e: Event) => {
      e.preventDefault();
      gesto = true;
      k0 = tRef.current.k;
    };
    const muda = (e: Event) => {
      e.preventDefault();
      if (navigator.maxTouchPoints > 0) return;
      const g = e as Gesto;
      z.scaleTo(sel, k0 * g.scale, ponto(g));
    };
    const fim = (e: Event) => {
      e.preventDefault();
      gesto = false;
    };
    svg.addEventListener('wheel', roda, { passive: false });
    svg.addEventListener('gesturestart', inicio);
    svg.addEventListener('gesturechange', muda);
    svg.addEventListener('gestureend', fim);
    return () => {
      sel.on('.zoom', null);
      svg.removeEventListener('mousedown', semAutoRolagem, true);
      svg.removeEventListener('wheel', roda);
      svg.removeEventListener('gesturestart', inicio);
      svg.removeEventListener('gesturechange', muda);
      svg.removeEventListener('gestureend', fim);
      if (quadro.current) cancelAnimationFrame(quadro.current);
      quadro.current = 0;
    };
  }, [aplicar]);

  const irPara = useCallback(
    (alvo: Transformacao, animar = true) => {
      const svg = svgRef.current;
      const z = zoomRef.current;
      if (!svg || !z) return;
      const tr = zoomIdentity.translate(alvo.x, alvo.y).scale(alvo.k);
      const d = animar ? DURACAO() : 0;
      if (d) select(svg).transition().duration(d).call(z.transform, tr);
      else select(svg).call(z.transform, tr);
    },
    [],
  );

  const enquadrarTudo = useCallback(
    (animar = true) => {
      if (!layout.raiz || !base.largura) return;
      const e = enquadrar({ x0: 0, y0: 0, x1: Math.min(layout.largura, opcoes.larguraAjuste), y1: layout.altura }, base, margens);
      zoomRef.current?.scaleExtent([e.k * 0.5, Math.max(60, e.k * 60)]);
      irPara(e, animar);
    },
    [layout, base, margens, opcoes.larguraAjuste, irPara],
  );

  // enquadra ao abrir, ao mudar o período/tamanho e quando o foco muda
  const primeira = useRef(true);
  useEffect(() => {
    if (!layout.raiz || !base.largura) return;
    const p = foco ? layout.porId.get(foco) : undefined;
    if (!p) {
      enquadrarTudo(!primeira.current);
    } else {
      const c = caixaDoRamo(p);
      // no celular, a margem é a dos rótulos das folhas mais fundas do ramo (as que ficam na borda)
      const ramo = estreita ? nosEmOrdem(p.no) : [];
      const fundo = Math.max(0, ...ramo.map((n) => n.profundidade));
      const m = estreita ? { ...margens, direita: margemDireita(ramo.filter((n) => !n.filhos.length && n.profundidade === fundo)) } : margens;
      const e = enquadrar({ ...c, x0: c.x0 - opcoes.larguraColuna * 0.7 }, base, m);
      irPara(e, !primeira.current);
    }
    primeira.current = false;
  }, [layout, base, foco, margens, estreita, margemDireita, opcoes.larguraColuna, enquadrarTudo, irPara]);

  // ----- toque, clique e passar o mouse -----
  const noNaTela = (clientX: number, clientY: number): NoPos | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const { k, x, y } = tRef.current;
    return noNoPonto(layout, (clientX - r.left - x) / k, (clientY - r.top - y) / k, 22 / k);
  };
  const menuNo = (e: React.MouseEvent, p: NoPos | null) => {
    if (!onMenu || !p || p.no.tipo === 'total') return;
    e.preventDefault();
    e.stopPropagation();
    setHover(null);
    onMenu(p.no, e);
  };
  // um clique dá zoom no nó (de novo no mesmo: volta um nível)
  const agir = (p: NoPos) => {
    if (p.no.tipo === 'total') return onFoco(null);
    onFoco(p.no.id === foco ? (p.pai && p.pai.no.tipo !== 'total' ? p.pai.no.id : null) : p.no.id);
  };
  const verMais = (p: NoPos | null) => p && p.no.tipo !== 'total' && onVerMais(p.no);
  // no toque, o 2º toque logo depois do 1º, no mesmo lugar, é o duplo clique: "ver mais" do nó do 1º toque (o zoom do
  // 1º toque já mexeu no desenho). O dblclick que o navegador gera no toque não conta; o d3-zoom não dá zoom no duplo toque.
  const dedo = useRef(false);
  const toqueAnterior = useRef<{ t: number; x: number; y: number; p: NoPos | null } | null>(null);
  const clicar = (e: React.MouseEvent, p: NoPos | null) => {
    if (dedo.current) {
      const a = toqueAnterior.current;
      const duplo = !!a && e.timeStamp - a.t < 400 && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 30;
      toqueAnterior.current = duplo ? null : { t: e.timeStamp, x: e.clientX, y: e.clientY, p };
      if (duplo) return verMais(a.p);
    } else if (e.detail > 1) return; // o 2º clique do duplo clique não conta aqui
    if (p) agir(p);
    // clique no vazio tira a seleção (volta a mostrar tudo); arrastar o canvas não conta como clique
    else if (foco) onFoco(null);
  };
  const duploClique = (p: NoPos | null) => !dedo.current && verMais(p);

  const destacados = useMemo(() => {
    if (!hover) return null;
    const p = layout.porId.get(hover.id);
    if (!p) return null;
    const s = new Set(trilhaDoNo(p).map((q) => q.no.id));
    const descer = (q: NoPos) => {
      s.add(q.no.id);
      q.filhos.forEach(descer);
    };
    descer(p);
    return s;
  }, [hover, layout]);
  const dentroDoFoco = useMemo(() => {
    const p = foco ? layout.porId.get(foco) : undefined;
    if (!p) return null;
    const s = new Set(trilhaDoNo(p).map((q) => q.no.id));
    const descer = (q: NoPos) => {
      s.add(q.no.id);
      q.filhos.forEach(descer);
    };
    descer(p);
    return s;
  }, [foco, layout]);
  const opacidade = (id: string) => (destacados ? (destacados.has(id) ? 1 : 0.22) : dentroDoFoco && !dentroDoFoco.has(id) ? 0.18 : 1);

  const teclas = (e: KeyboardEventReact) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    const centro: [number, number] = [vista.largura / 2, vista.altura / 2];
    if (e.key === '+' || e.key === '=') z.scaleBy(select(svg), 1.4, centro);
    else if (e.key === '-') z.scaleBy(select(svg), 1 / 1.4, centro);
    else if (e.key === '0' || e.key === 'Escape') onFoco(null);
    else return;
    e.preventDefault();
  };
  const botaoZoom = (f: number) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    const centro: [number, number] = [vista.largura / 2, vista.altura / 2];
    if (DURACAO()) z.scaleBy(select(svg).transition().duration(250), f, centro);
    else z.scaleBy(select(svg), f, centro);
  };

  // ----- rótulos (pixels de tela) -----
  const total = raiz.valor;
  const rotulos = layout.nos.flatMap((p) => {
    const { k, x, y } = t;
    const X0 = x + p.x0 * k;
    const X1 = x + p.x1 * k;
    const Y0 = y + p.y0 * k;
    const Y1 = y + p.y1 * k;
    if (Y1 < -40 || Y0 > vista.altura + 40 || X0 > vista.largura + 20 || X1 < -400) return [];
    const h = Y1 - Y0;
    const meio = (Y0 + Y1) / 2;
    const no = p.no;
    const valor = brl0(no.valor);
    if (no.tipo === 'total') {
      if (h < 44 || X1 - X0 < 54) return [];
      return [
        <g key={no.id} className="pointer-events-none" textAnchor="middle">
          <text x={(X0 + X1) / 2} y={meio - 6} fontSize={11} letterSpacing="0.14em" fill="var(--ink-2)" fontWeight={600}>
            GASTOS
          </text>
          <text x={(X0 + X1) / 2} y={meio + 14} fontSize={X1 - X0 > 110 ? 19 : X1 - X0 > 72 ? 15 : 13} fontWeight={700} fill="var(--ink)" className="tabular">
            {valor}
          </text>
        </g>,
      ];
    }
    const prioridade = hover?.id === no.id || no.tipo === 'nao-planejado';
    const linhas = linhasDeRotulo(h + (p.filhos.length ? 0 : 2), prioridade);
    if (!linhas) return [];
    const folha = !p.filhos.length;
    const pct = total > 0 ? Math.round((no.valor / total) * 100) : 0;
    const complemento = pct >= 1 ? ` · ${pct}%` : '';
    const halo = { paintOrder: 'stroke' as const, stroke: 'var(--surface)', strokeWidth: 3, strokeLinejoin: 'round' as const };
    const opac = opacidade(no.id);
    if (folha) {
      const tx = X1 + 6;
      const teto = estreita ? 150 : 240;
      // no celular o rótulo não passa da borda da direita: encurta com "…" (o valor sai antes do nome) ou não aparece
      const ate = estreita ? vista.largura - tx - 6 : Infinity;
      if (ate < 32) return [];
      const larguraValor = medir(`  ${valor}`, fonteValor);
      const comValor = linhas === 2 || ate - larguraValor >= 40;
      const nome = caber(nomeDaFolha(no), Math.min(teto, linhas === 1 && comValor ? ate - larguraValor : ate), fonteNome);
      if (!nome) return [];
      const linhaValor = [valor + complemento, valor].find((v) => medir(v, fonteValor) <= ate);
      return [
        <g key={no.id} opacity={opac} style={{ cursor: 'pointer' }} onClick={(e) => (e.stopPropagation(), clicar(e, p))} onDoubleClick={(e) => (e.stopPropagation(), duploClique(p))} onContextMenu={(e) => menuNo(e, p)}>
          {linhas === 2 ? (
            <>
              <text x={tx} y={meio - 2} fontSize={12} fontWeight={500} fill="var(--ink)" style={halo}>
                {nome}
              </text>
              {linhaValor && (
                <text x={tx} y={meio + 12} fontSize={11} fill="var(--ink-2)" className="tabular" style={halo}>
                  {linhaValor}
                </text>
              )}
            </>
          ) : (
            <text x={tx} y={meio + 4} fontSize={12} fontWeight={500} fill="var(--ink)" style={halo}>
              {nome}
              {comValor && (
                <tspan fill="var(--ink-2)" fontWeight={400} className="tabular">
                  {'  '}
                  {valor}
                </tspan>
              )}
            </text>
          )}
        </g>,
      ];
    }
    // nó do meio: à esquerda da barra, por cima da fita que chega nele
    const espaco = opcoes.larguraColuna * t.k - 12;
    if (espaco < 40) return [];
    const nome = caber(no.nome, espaco - (linhas === 1 ? medir(`  ${valor}`, fonteValor) : 0), fonteNome);
    if (!nome) return [];
    const complementoMeio = medir(valor + complemento, fonteValor) <= espaco ? complemento : '';
    const tx = X0 - 6;
    return [
      <g key={no.id} opacity={opac} textAnchor="end" style={{ cursor: 'pointer' }} onClick={(e) => (e.stopPropagation(), clicar(e, p))} onDoubleClick={(e) => (e.stopPropagation(), duploClique(p))} onContextMenu={(e) => menuNo(e, p)}>
        {linhas === 2 ? (
          <>
            <text x={tx} y={meio - 2} fontSize={12} fontWeight={600} fill="var(--ink)" style={halo}>
              {nome}
            </text>
            <text x={tx} y={meio + 12} fontSize={11} fill="var(--ink-2)" className="tabular" style={halo}>
              {valor}
              {complementoMeio}
            </text>
          </>
        ) : (
          <text x={tx} y={meio + 4} fontSize={12} fontWeight={600} fill="var(--ink)" style={halo}>
            {nome}
            <tspan fill="var(--ink-2)" fontWeight={400} className="tabular">
              {'  '}
              {valor}
            </tspan>
          </text>
        )}
      </g>,
    ];
  });

  const dica = hover ? layout.porId.get(hover.id) : undefined;

  return (
    <div
      ref={caixaRef}
      className="relative h-full w-full select-none overflow-hidden rounded-2xl border border-borda bg-surface outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ touchAction: 'none', overscrollBehavior: 'contain', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      tabIndex={0}
      onKeyDown={teclas}
      aria-label="Diagrama de fluxo dos gastos. Arraste para mover, pinça ou roda para zoom; + e − no teclado."
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="img"
        aria-label={`Gastos de ${brl0(total)}: ${raiz.filhos
          .slice(0, 5)
          .map((f) => `${f.nome} ${brl0(f.valor)}`)
          .join(', ')}`}
        style={{ cursor: hover ? 'pointer' : 'grab', display: 'block' }}
        onPointerDown={(e) => (dedo.current = e.pointerType !== 'mouse')}
        onClick={(e) => clicar(e, noNaTela(e.clientX, e.clientY))}
        onDoubleClick={(e) => duploClique(noNaTela(e.clientX, e.clientY))}
        onContextMenu={(e) => menuNo(e, noNaTela(e.clientX, e.clientY))}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || e.buttons) return;
          const p = noNaTela(e.clientX, e.clientY);
          const r = caixaRef.current!.getBoundingClientRect();
          setHover(p && p.no.tipo !== 'total' ? { id: p.no.id, x: e.clientX - r.left, y: e.clientY - r.top } : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id="fluxo-pontos" ref={pontosRef} width={22} height={22} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--grid)" />
          </pattern>
          <pattern id="fluxo-hachura" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="var(--surface)" strokeWidth={2} strokeOpacity={0.55} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#fluxo-pontos)" />
        <g ref={mundoRef}>
          {layout.fitas.map((f) => (
            <path
              key={f.id}
              d={f.d}
              fill={corDoNo(f.para.no)}
              fillOpacity={0.4}
              stroke={corDoNo(f.para.no)}
              strokeOpacity={0.35}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
              opacity={opacidade(f.para.no.id)}
            />
          ))}
          {layout.nos.map((p) =>
            p.no.tipo === 'total' ? (
              <g key={p.no.id}>
                <rect
                  x={p.x0}
                  y={p.y0}
                  width={p.x1 - p.x0}
                  height={p.y1 - p.y0}
                  rx={6}
                  fill="color-mix(in oklab, var(--accent) 16%, var(--surface))"
                  stroke="color-mix(in oklab, var(--accent) 45%, var(--surface))"
                  vectorEffect="non-scaling-stroke"
                />
                <rect x={p.x1 - 3} y={p.y0} width={3} height={p.y1 - p.y0} fill="var(--accent)" />
              </g>
            ) : (
              <g key={p.no.id} opacity={opacidade(p.no.id)}>
                <rect x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} rx={1.5} fill={corDoNo(p.no)} />
                {p.no.tipo === 'nao-planejado' && (
                  <rect x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} fill="url(#fluxo-hachura)" />
                )}
              </g>
            ),
          )}
        </g>
        <g>{rotulos}</g>
      </svg>

      {!layout.raiz && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">Nenhum gasto nesse período.</p>
      )}

      {/* no toque, + e − saem (a pinça faz isso) e o Ajustar vai para o canto de cima à esquerda, acima do GASTOS, onde não há
          rótulo; com um ramo aberto ele sai (a trilha do ramo fica nesse canto e o "Todas" dela faz o mesmo) */}
      <div
        className="absolute right-2 top-2 flex flex-col gap-1.5 pointer-coarse:left-2 pointer-coarse:right-auto"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <BotaoCanvas rotulo="Aproximar" onClick={() => botaoZoom(1.5)} className="pointer-coarse:hidden">
          <Plus size={16} />
        </BotaoCanvas>
        <BotaoCanvas rotulo="Afastar" onClick={() => botaoZoom(1 / 1.5)} className="pointer-coarse:hidden">
          <Minus size={16} />
        </BotaoCanvas>
        <BotaoCanvas rotulo="Ajustar à tela" onClick={() => (foco ? onFoco(null) : enquadrarTudo())} className={foco ? 'pointer-coarse:hidden' : ''}>
          <Maximize2 size={15} />
        </BotaoCanvas>
      </div>

      {dica && hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-xl border border-borda bg-surface p-3 text-xs shadow-xl"
          style={{
            left: Math.min(hover.x + 14, vista.largura - 232),
            top: Math.min(hover.y + 14, vista.altura - 120),
          }}
        >
          <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: corDoNo(dica.no) }} />
            <span className="truncate">{dica.no.nome}</span>
          </div>
          <div className="tabular text-sm">{brl(dica.no.valor)}</div>
          <div className="mt-1 space-y-0.5 text-ink-2">
            {dica.pai && dica.pai.no.tipo !== 'total' && (
              <div>{Math.round((dica.no.valor / dica.pai.no.valor) * 100)}% de {dica.pai.no.nome}</div>
            )}
            <div>{Math.round((dica.no.valor / Math.max(1, total)) * 100)}% do total</div>
            <div>
              {dica.no.n} lançamento{dica.no.n === 1 ? '' : 's'}
              {dica.no.plano !== null && dica.no.plano > 0 && <> · plano {brl0(dica.no.plano)}</>}
            </div>
            <div className="text-muted">Clique: zoom · duplo clique: ver mais</div>
          </div>
        </div>
      )}
    </div>
  );
}

function BotaoCanvas({ rotulo, onClick, className = '', children }: { rotulo: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex size-9 items-center justify-center rounded-xl border border-borda bg-surface/90 text-ink-2 shadow-sm backdrop-blur active:scale-95 max-lg:size-10 ${className}`}
      aria-label={rotulo}
      title={rotulo}
    >
      {children}
    </button>
  );
}
