// Diagrama de fluxo dos gastos (aba Gastos): a árvore de categorias com o que foi gasto no período e o layout
// de uma "Sankey em árvore" — cada nível numa coluna, altura proporcional ao valor, fitas ligando pai e filhos.
// Tudo puro (sem DOM), para testar.
import { caminho, descendentes, filhas } from './categorias.ts';
import { gastosPorCategoria, mesesDoCalendario, NAO_PLANEJADO, type Periodo } from './analise.ts';
import type { Config, Natureza, Transacao } from './tipos.ts';

const r2 = (v: number) => Math.round(v * 100) / 100;
const QUASE_ZERO = 0.005;

export type TipoNo = 'total' | 'categoria' | 'geral' | 'nao-planejado';

export interface NoFluxo {
  /** único no diagrama (a folha "(geral)" é `<id>#geral`) */
  id: string;
  /** categoria cujos lançamentos a folha mostra (NAO_PLANEJADO no não planejado; null no total e em quem tem filhos) */
  linha: string | null;
  /** categoria do app que o nó representa (null no total e no não planejado) */
  categoria: string | null;
  nome: string;
  tipo: TipoNo;
  valor: number;
  /** quantos lançamentos */
  n: number;
  /** plano do período (dela + o que está dentro); null quando não tem plano */
  plano: number | null;
  profundidade: number;
  /** posição da categoria principal no nível de cima da config (cor estável); -1 = não planejado; -2 = total */
  ramo: number;
  filhos: NoFluxo[];
}

const ordenar = (ns: NoFluxo[]) => ns.sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));

/** Posição da categoria principal (a de mais em cima) de uma categoria: dá a cor do ramo, igual no diagrama e na lista. */
export function ramoDe(c: Config, id: string): number {
  const raiz = caminho(c, id)[0];
  return raiz ? filhas(c, null).findIndex((l) => l.id === raiz.id) : -1;
}

/**
 * Árvore do que foi gasto no período: cada categoria vale o que foi lançado nela + tudo dentro dela.
 * Categorias sem gasto saem; o gasto próprio de uma categoria de cima vira a folha "Nome (geral)";
 * o não planejado é um ramo à parte, sempre em cima (é o vazamento). Estorno maior que a compra não vira valor negativo.
 * Com `natureza`, só conta o gasto (e o plano) das categorias desse tipo, e o não planejado sai.
 */
export function arvoreDeGastos(c: Config, ts: Transacao[], p: Periodo, natureza?: Natureza | null): NoFluxo {
  const gastos = new Map(gastosPorCategoria(c, ts, p).map((g) => [g.id, g]));
  const meses = mesesDoCalendario(p);
  const vistos = new Set<string>();
  const conta = (id: string) => !natureza || c.orcamento.find((l) => l.id === id)?.natureza === natureza;
  const plano = (id: string) => r2([...descendentes(c, id)].reduce((s, x) => s + (conta(x) ? (c.orcamento.find((l) => l.id === x)?.valor ?? 0) : 0), 0));

  const rec = (id: string, nome: string, valorPlano: number, prof: number, ramo: number): NoFluxo | null => {
    if (vistos.has(id)) return null;
    vistos.add(id);
    const g = conta(id) ? gastos.get(id) : undefined;
    if (!conta(id)) valorPlano = 0;
    const proprio = Math.max(0, g?.total ?? 0);
    const filhos = filhas(c, id)
      .map((f) => rec(f.id, f.nome, f.valor, prof + 1, ramo))
      .filter((x): x is NoFluxo => !!x);
    if (!filhos.length) {
      if (proprio <= QUASE_ZERO) return null;
      return { id, linha: id, categoria: id, nome, tipo: 'categoria', valor: r2(proprio), n: g?.n ?? 0, plano: r2(valorPlano * meses), profundidade: prof, ramo, filhos: [] };
    }
    if (proprio > QUASE_ZERO)
      filhos.push({
        id: `${id}#geral`,
        linha: id,
        categoria: id,
        nome: `${nome} (geral)`,
        tipo: 'geral',
        valor: r2(proprio),
        n: g?.n ?? 0,
        plano: valorPlano > 0 ? r2(valorPlano * meses) : null,
        profundidade: prof + 1,
        ramo,
        filhos: [],
      });
    ordenar(filhos);
    return {
      id,
      linha: null,
      categoria: id,
      nome,
      tipo: 'categoria',
      valor: r2(filhos.reduce((s, f) => s + f.valor, 0)),
      n: filhos.reduce((s, f) => s + f.n, 0),
      plano: r2(plano(id) * meses),
      profundidade: prof,
      ramo,
      filhos,
    };
  };

  const categorias = ordenar(
    filhas(c, null)
      .map((l, i) => rec(l.id, l.nome, l.valor, 1, i))
      .filter((x): x is NoFluxo => !!x),
  );
  const nao = natureza ? undefined : gastos.get(NAO_PLANEJADO);
  const topo: NoFluxo[] =
    nao && nao.total > QUASE_ZERO
      ? [{ id: NAO_PLANEJADO, linha: NAO_PLANEJADO, categoria: null, nome: 'Não planejado', tipo: 'nao-planejado', valor: r2(nao.total), n: nao.n, plano: null, profundidade: 1, ramo: -1, filhos: [] }]
      : [];
  const filhos = [...topo, ...categorias];
  return {
    id: '_total',
    linha: null,
    categoria: null,
    nome: 'Gastos',
    tipo: 'total',
    valor: r2(filhos.reduce((s, f) => s + f.valor, 0)),
    n: filhos.reduce((s, f) => s + f.n, 0),
    plano: null,
    profundidade: 0,
    ramo: -2,
    filhos,
  };
}

/** Todos os nós, pai antes dos filhos. */
export function nosEmOrdem(raiz: NoFluxo): NoFluxo[] {
  const r: NoFluxo[] = [];
  const visitar = (n: NoFluxo) => {
    r.push(n);
    n.filhos.forEach(visitar);
  };
  visitar(raiz);
  return r;
}

// ---------- Layout ----------

export interface OpcoesLayout {
  /** vão horizontal entre colunas, onde passam as fitas */
  larguraColuna: number;
  /** largura das barras de cada categoria */
  larguraNo: number;
  /** largura do bloco "GASTOS" */
  larguraRaiz: number;
  /** altura do bloco "GASTOS" (define a escala: R$ por unidade) */
  alturaTotal: number;
  /** barra mínima, para o que é pequeno ainda aparecer e dar para tocar */
  hMin?: number;
  /** espaço entre irmãs, por profundidade */
  gap?: (profundidade: number) => number;
}

export interface NoPos {
  no: NoFluxo;
  pai: NoPos | null;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** faixa vertical reservada para o nó e tudo dentro dele (nada de outro ramo entra nela) */
  faixaY0: number;
  faixaY1: number;
  filhos: NoPos[];
}

export interface Fita {
  id: string;
  de: NoPos;
  para: NoPos;
  /** topo da fita na saída (borda direita do pai) e na chegada (borda esquerda do filho) */
  sy0: number;
  ty0: number;
  /** espessura */
  t: number;
  d: string;
}

export interface LayoutFluxo {
  raiz: NoPos | null;
  nos: NoPos[];
  fitas: Fita[];
  porId: Map<string, NoPos>;
  /** caixa do desenho (sem os rótulos) */
  largura: number;
  altura: number;
  /** unidades de desenho por real */
  escala: number;
}

export const gapPadrao = (d: number) => Math.max(2, 12 * 0.6 ** Math.max(0, d - 1));

/** Borda esquerda da coluna de uma profundidade. */
export function xDaColuna(d: number, o: Pick<OpcoesLayout, 'larguraColuna' | 'larguraNo' | 'larguraRaiz'>): number {
  return d === 0 ? 0 : o.larguraRaiz + o.larguraColuna + (d - 1) * (o.larguraNo + o.larguraColuna);
}

/**
 * Árvore proporcional: altura = valor × escala; cada subárvore ocupa uma faixa (o maior entre a barra e o bloco
 * dos filhos com espaços), a barra fica centrada na faixa e o bloco dos filhos centrado na barra. Por construção
 * nada se sobrepõe: faixas de irmãs não se cruzam e tudo que é de um ramo fica dentro da faixa dele.
 */
export function layoutFluxo(raiz: NoFluxo, o: OpcoesLayout): LayoutFluxo {
  const vazio: LayoutFluxo = { raiz: null, nos: [], fitas: [], porId: new Map(), largura: 0, altura: 0, escala: 0 };
  if (raiz.valor <= QUASE_ZERO) return vazio;
  const hMin = o.hMin ?? 2;
  const gap = o.gap ?? gapPadrao;
  const s = o.alturaTotal / raiz.valor;
  const h = (n: NoFluxo) => (n.tipo === 'total' ? o.alturaTotal : Math.max(hMin, n.valor * s));

  // 1ª passada: tamanho da faixa de cada subárvore
  const ext = new Map<NoFluxo, number>();
  const bloco = new Map<NoFluxo, number>();
  const medir = (n: NoFluxo): number => {
    const b = n.filhos.reduce((soma, f) => soma + medir(f), 0) + gap(n.profundidade + 1) * Math.max(0, n.filhos.length - 1);
    bloco.set(n, b);
    const e = n.filhos.length ? Math.max(h(n), b) : h(n);
    ext.set(n, e);
    return e;
  };
  medir(raiz);

  // 2ª passada: posições
  const nos: NoPos[] = [];
  const porId = new Map<string, NoPos>();
  let largura = 0;
  const posicionar = (n: NoFluxo, topo: number, pai: NoPos | null): NoPos => {
    const e = ext.get(n)!;
    const hn = h(n);
    const x0 = xDaColuna(n.profundidade, o);
    const x1 = x0 + (n.profundidade === 0 ? o.larguraRaiz : o.larguraNo);
    const p: NoPos = { no: n, pai, x0, x1, y0: topo + (e - hn) / 2, y1: topo + (e + hn) / 2, faixaY0: topo, faixaY1: topo + e, filhos: [] };
    nos.push(p);
    porId.set(n.id, p);
    largura = Math.max(largura, x1);
    let y = topo + (e - bloco.get(n)!) / 2;
    const g = gap(n.profundidade + 1);
    for (const f of n.filhos) {
      p.filhos.push(posicionar(f, y, p));
      y += ext.get(f)! + g;
    }
    return p;
  };
  const raizPos = posicionar(raiz, 0, null);

  // fitas: saídas empilhadas na borda direita do pai, chegada centrada no filho
  const fitas: Fita[] = [];
  for (const p of nos) {
    if (!p.filhos.length) continue;
    const espessuras = p.filhos.map((f) => f.no.valor * s);
    let sy = p.y0 + (p.y1 - p.y0 - espessuras.reduce((a, b) => a + b, 0)) / 2;
    p.filhos.forEach((f, i) => {
      const t = espessuras[i];
      const ty = f.y0 + (f.y1 - f.y0 - t) / 2;
      fitas.push({ id: f.no.id, de: p, para: f, sy0: sy, ty0: ty, t, d: caminhoFita(p.x1, sy, f.x0, ty, t) });
      sy += t;
    });
  }
  return { raiz: raizPos, nos, fitas, porId, largura, altura: ext.get(raiz)!, escala: s };
}

/** Faixa em curva (bézier cúbica com as alças no meio), fechada. */
export function caminhoFita(x0: number, sy: number, x1: number, ty: number, t: number): string {
  const xm = (x0 + x1) / 2;
  const f = (v: number) => Math.round(v * 100) / 100;
  return `M${f(x0)},${f(sy)}C${f(xm)},${f(sy)} ${f(xm)},${f(ty)} ${f(x1)},${f(ty)}L${f(x1)},${f(ty + t)}C${f(xm)},${f(ty + t)} ${f(xm)},${f(sy + t)} ${f(x0)},${f(sy + t)}Z`;
}

/**
 * Altura do bloco "GASTOS": o bastante para cada folha ter uns 18 de altura em média, e no mínimo o formato da tela
 * (no iPhone em pé o diagrama ocupa a altura toda em vez de virar uma faixa fina no meio).
 */
export function alturaIdeal(raiz: NoFluxo, larguraDesenho: number, vista: { largura: number; altura: number }): number {
  const folhas = nosEmOrdem(raiz).filter((n) => !n.filhos.length).length;
  const proporcao = vista.largura > 0 ? vista.altura / vista.largura : 1;
  return Math.min(3000, Math.max(360, folhas * 18, larguraDesenho * proporcao * 0.85));
}

// ---------- Enquadrar, rótulos e toque ----------

export interface Transformacao {
  k: number;
  x: number;
  y: number;
}

export interface Margens {
  topo: number;
  direita: number;
  baixo: number;
  esquerda: number;
}

/** Zoom e deslocamento para a caixa (em unidades do desenho) caber na vista (em pixels), com margens. */
export function enquadrar(
  caixa: { x0: number; y0: number; x1: number; y1: number },
  vista: { largura: number; altura: number },
  m: Margens,
  kMax = 40,
): Transformacao {
  const w = Math.max(1, vista.largura - m.esquerda - m.direita);
  const h = Math.max(1, vista.altura - m.topo - m.baixo);
  const bw = Math.max(1e-6, caixa.x1 - caixa.x0);
  const bh = Math.max(1e-6, caixa.y1 - caixa.y0);
  const k = Math.min(kMax, w / bw, h / bh);
  return { k, x: m.esquerda + (w - bw * k) / 2 - caixa.x0 * k, y: m.topo + (h - bh * k) / 2 - caixa.y0 * k };
}

/** Caixa de um nó e tudo dentro dele (para dar zoom num ramo). */
export function caixaDoRamo(p: NoPos): { x0: number; y0: number; x1: number; y1: number } {
  let x1 = p.x1;
  const visitar = (q: NoPos) => {
    x1 = Math.max(x1, q.x1);
    q.filhos.forEach(visitar);
  };
  visitar(p);
  return { x0: p.x0, y0: p.faixaY0, x1, y1: p.faixaY1 };
}

/**
 * Quantas linhas de rótulo cabem numa barra com esta altura na tela: 2 (nome e valor), 1 (nome · valor) ou 0.
 * Com prioridade (passando o mouse, selecionada, não planejado) aceita barras menores.
 */
export function linhasDeRotulo(alturaNaTela: number, prioridade = false): 0 | 1 | 2 {
  if (alturaNaTela >= 30) return 2;
  if (alturaNaTela >= (prioridade ? 9 : 14)) return 1;
  return 0;
}

/** y do meio de uma fita na posição x (a curva é a mesma da `caminhoFita`). */
function yDaFita(f: Fita, x: number): number {
  const u = Math.min(1, Math.max(0, (x - f.de.x1) / Math.max(1e-6, f.para.x0 - f.de.x1)));
  // x(t) = 1,5t − 1,5t² + t³ (alças no meio); resolve t por Newton e usa y(t) = 3t² − 2t³
  let t = u;
  for (let i = 0; i < 6; i++) {
    const fx = 1.5 * t - 1.5 * t * t + t * t * t - u;
    const dfx = 1.5 - 3 * t + 3 * t * t;
    t = Math.min(1, Math.max(0, t - fx / Math.max(1e-6, dfx)));
  }
  const y = 3 * t * t - 2 * t * t * t;
  return f.sy0 + (f.ty0 - f.sy0) * y + f.t / 2;
}

/**
 * O nó sob um ponto do desenho. Barras finas ganham uma área de toque mínima (`toque` em unidades do desenho);
 * tocar numa fita escolhe o filho para onde ela vai.
 */
export function noNoPonto(l: LayoutFluxo, x: number, y: number, toque: number): NoPos | null {
  let melhor: NoPos | null = null;
  let distancia = Infinity;
  for (const p of l.nos) {
    if (x < p.x0 - toque / 2 || x > p.x1 + toque / 2) continue;
    const meio = (p.y0 + p.y1) / 2;
    const meiaAltura = Math.max((p.y1 - p.y0) / 2, toque / 2);
    const dy = Math.abs(y - meio);
    if (dy <= meiaAltura && dy < distancia) {
      melhor = p;
      distancia = dy;
    }
  }
  if (melhor) return melhor;
  for (const f of l.fitas) {
    if (x < f.de.x1 || x > f.para.x0) continue;
    const dy = Math.abs(y - yDaFita(f, x));
    const meia = Math.max(f.t / 2, toque / 4);
    if (dy <= meia && dy < distancia) {
      melhor = f.para;
      distancia = dy;
    }
  }
  return melhor;
}

/** Trilha do total até o nó ("Gastos › Casa › Contas da casa"). */
export function trilhaDoNo(p: NoPos | null): NoPos[] {
  const r: NoPos[] = [];
  for (let q = p; q; q = q.pai) r.unshift(q);
  return r;
}
