// Análise de gastos por período: categorias, estabelecimentos e presets de data.
import { r2 } from './calculos.ts';
import { caminho, passaNoFiltro } from './categorias.ts';
import { deIsoDia, diasNoMes, somarMeses } from './datas.ts';
import { nucleoDescricao } from './importar/formatos.ts';
import type { Config, Natureza, Transacao } from './tipos.ts';

export type Preset = 'mes' | 'mes-passado' | '3m' | '6m' | 'tudo' | 'datas';

export interface Periodo {
  de: string;
  ate: string;
}

export function periodoDoPreset(p: Exclude<Preset, 'datas'>, hoje: string, transacoes: Transacao[] = []): Periodo {
  const mes = hoje.slice(0, 7);
  if (p === 'mes') return { de: `${mes}-01`, ate: hoje };
  if (p === 'mes-passado') {
    const ant = somarMeses(mes, -1);
    return { de: `${ant}-01`, ate: `${ant}-${String(diasNoMes(ant)).padStart(2, '0')}` };
  }
  if (p === '3m') return { de: `${somarMeses(mes, -2)}-01`, ate: hoje };
  if (p === '6m') return { de: `${somarMeses(mes, -5)}-01`, ate: hoje };
  const datas = transacoes.map((t) => t.data).sort();
  return { de: datas[0] ?? `${mes}-01`, ate: hoje };
}

/** Quantos "meses" cabem no período (para comparar com o orçamento mensal). */
export function mesesNoPeriodo({ de, ate }: Periodo): number {
  const dias = Math.round((deIsoDia(ate).getTime() - deIsoDia(de).getTime()) / 86_400_000) + 1;
  return Math.max(dias, 1) / 30.44;
}

/** Meses do calendário que o período toca (set/1–18 = 1; jul/1–set/18 = 3). É a base do orçamento: contas mensais não se dividem por dia. */
export function mesesDoCalendario({ de, ate }: Periodo): number {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return Math.max(1, (a2 - a1) * 12 + (m2 - m1) + 1);
}

export const NAO_PLANEJADO = '_nao';

export interface GastoCategoria {
  id: string; // id da linha do orçamento ou NAO_PLANEJADO
  nome: string;
  natureza: Natureza | null;
  total: number;
  n: number;
  /** orçamento mensal × meses do calendário no período (null para não planejado) */
  orcamento: number | null;
}

export function despesasNoPeriodo(ts: Transacao[], p: Periodo): Transacao[] {
  return ts.filter((t) => t.tipo === 'despesa' && t.data >= p.de && t.data <= p.ate);
}

export function gastosPorCategoria(c: Config, ts: Transacao[], p: Periodo): GastoCategoria[] {
  const meses = mesesDoCalendario(p);
  const mapa = new Map<string, GastoCategoria>();
  for (const t of despesasNoPeriodo(ts, p)) {
    const linha = t.linha ? c.orcamento.find((l) => l.id === t.linha) : undefined;
    const id = linha?.id ?? NAO_PLANEJADO;
    const atual =
      mapa.get(id) ??
      ({
        id,
        nome: linha?.nome ?? 'Não planejado',
        natureza: linha?.natureza ?? null,
        total: 0,
        n: 0,
        orcamento: linha ? r2(linha.valor * meses) : null,
      } satisfies GastoCategoria);
    atual.total = r2(atual.total + t.valor);
    atual.n++;
    mapa.set(id, atual);
  }
  return [...mapa.values()].filter((g) => g.total !== 0).sort((a, b) => b.total - a.total);
}

export interface GastoNaArvore {
  valor: number;
  n: number;
}

/**
 * Quanto saiu em cada categoria no período, somando o que está dentro dela (e NAO_PLANEJADO, sem filtro).
 * Com `natureza`, só conta o gasto próprio das categorias desse tipo.
 */
export function gastoNaArvore(c: Config, ts: Transacao[], p: Periodo, natureza?: Natureza | null): Map<string, GastoNaArvore> {
  const r = new Map<string, GastoNaArvore>();
  const somar = (id: string, g: GastoCategoria) => {
    const atual = r.get(id) ?? { valor: 0, n: 0 };
    r.set(id, { valor: r2(atual.valor + g.total), n: atual.n + g.n });
  };
  const passa = passaNoFiltro(c, natureza);
  for (const g of gastosPorCategoria(c, ts, p)) {
    if (g.id === NAO_PLANEJADO) {
      if (!natureza) somar(NAO_PLANEJADO, g);
      continue;
    }
    if (natureza && (g.natureza !== natureza || !passa(g.id))) continue;
    for (const l of caminho(c, g.id)) somar(l.id, g);
  }
  return r;
}

export interface GrupoACategorizar {
  nome: string;
  itens: Transacao[];
  total: number;
}

/**
 * Gastos que vieram do banco sem categoria e que você ainda não olhou (não editados), por estabelecimento.
 * Escolher qualquer coisa na folha de editar — até "Não planejado" — tira da lista.
 */
export function aCategorizar(c: Config, ts: Transacao[]): GrupoACategorizar[] {
  const mapa = new Map<string, GrupoACategorizar>();
  for (const t of ts) {
    if (t.tipo !== 'despesa' || t.origem === 'manual' || t.editado || c.orcamento.some((l) => l.id === t.linha)) continue;
    const nome = nomeEstabelecimento(t.descricao);
    const g = mapa.get(nome) ?? { nome, itens: [], total: 0 };
    g.itens.push(t);
    g.total = r2(g.total + t.valor);
    mapa.set(nome, g);
  }
  for (const g of mapa.values()) g.itens.sort((a, b) => b.data.localeCompare(a.data));
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/**
 * Nome "limpo" do estabelecimento a partir da descrição do banco:
 * "IFD*PADARIA EXEMPLO LTDA SAO PAULO BRA" → "Padaria Exemplo Ltda", "Pix enviado para JOSE" → "Jose".
 */
export function nomeEstabelecimento(descricao: string): string {
  const d = nucleoDescricao(descricao);
  if (!d) return descricao.trim();
  return d
    .toLowerCase()
    .split(' ')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export interface GastoEstabelecimento {
  nome: string;
  total: number;
  n: number;
}

export function porEstabelecimento(ts: Transacao[]): GastoEstabelecimento[] {
  const mapa = new Map<string, GastoEstabelecimento>();
  for (const t of ts) {
    const nome = nomeEstabelecimento(t.descricao);
    const g = mapa.get(nome) ?? { nome, total: 0, n: 0 };
    g.total = r2(g.total + t.valor);
    g.n++;
    mapa.set(nome, g);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}
