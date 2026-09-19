// Todas as contas do app. Funções puras: recebem os dados, devolvem números.
import { isoMes, mesesAnteriores, somarMeses } from './datas.ts';
import type { Config, LinhaOrcamento, Metas, Natureza, Patrimonio, Transacao } from './tipos.ts';

export const r2 = (n: number) => Math.round(n * 100) / 100;
const soma = (ns: number[]) => r2(ns.reduce((a, b) => a + b, 0));

/** Média mensal de um gasto irregular (ex.: R$420 de água em 3,5 meses → 120). */
export function mediaMensal(total: number, meses: number): number {
  return r2(total / meses);
}

// ---------- Renda e orçamento ----------

/** Soma da renda fixa que o usuário informou (ex.: Salário, R$ 5.000). */
export function rendaFixaMensal(c: Config): number {
  return soma(c.rendaFixa.map((r) => r.valor));
}

export interface RendaMedia {
  valor: number;
  /** meses que entraram na conta (só os que têm lançamentos, até `n`) */
  meses: string[];
}

/**
 * Média do que entrou de verdade (receitas) nos últimos `n` meses completos. Conta só a partir do primeiro mês
 * com lançamentos, para não diluir a média com meses de antes de o banco estar conectado.
 */
export function rendaMedia(ts: Transacao[], n: number, mesAtual: string = isoMes()): RendaMedia {
  const primeiro = ts.reduce((m, t) => (t.data < m ? t.data : m), '9999').slice(0, 7);
  const meses = mesesAnteriores(mesAtual, n).filter((m) => m >= primeiro);
  if (!meses.length) return { valor: 0, meses: [] };
  const total = soma(receitas(ts).filter((t) => meses.includes(t.data.slice(0, 7))).map((t) => t.valor));
  return { valor: r2(total / meses.length), meses };
}

/** Plano por mês de um tipo (fixo / flexível / pontual). Pontual = média mensal do que é irregular. */
export function totalNatureza(c: Config, natureza: Natureza): number {
  return soma(c.orcamento.filter((l) => l.natureza === natureza).map((l) => l.valor));
}

/** Custo para viver um mês segundo o plano: todas as categorias (os pontuais pela média). O real está em `custoReal`. */
export function custoEssencial(c: Config): number {
  return soma(c.orcamento.map((l) => l.valor));
}

/** O que sobra da renda fixa depois do plano do mês — é o que vai para as metas. */
export function sobraPlanejada(c: Config): number {
  return r2(rendaFixaMensal(c) - custoEssencial(c));
}

/** Quanto deveria ir para as metas por mês, segundo o plano (= a sobra). */
export function aportePlanejado(c: Config): number {
  return sobraPlanejada(c);
}

export function linhaPorId(c: Config, id: string | null | undefined): LinhaOrcamento | undefined {
  return id ? c.orcamento.find((l) => l.id === id) : undefined;
}

// ---------- Transações ----------

export const doMes = (ts: Transacao[], mes: string) => ts.filter((t) => t.data.startsWith(mes));
export const despesas = (ts: Transacao[]) => ts.filter((t) => t.tipo === 'despesa');
export const receitas = (ts: Transacao[]) => ts.filter((t) => t.tipo === 'receita');

/** Linha inexistente no orçamento também conta como "não planejado". */
export function naoPlanejada(c: Config, t: Transacao): boolean {
  return t.tipo === 'despesa' && !linhaPorId(c, t.linha);
}

export function gastoPorLinha(c: Config, ts: Transacao[], mes: string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const t of despesas(doMes(ts, mes))) {
    const id = linhaPorId(c, t.linha)?.id ?? '_nao_planejado';
    r[id] = r2((r[id] ?? 0) + t.valor);
  }
  return r;
}

/** Média real por categoria nos meses dados (só despesas; '_nao_planejado' = sem categoria). */
export function mediaRealPorLinha(c: Config, ts: Transacao[], meses: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const mes of meses) for (const [id, v] of Object.entries(gastoPorLinha(c, ts, mes))) r[id] = (r[id] ?? 0) + v;
  for (const id in r) r[id] = r2(r[id] / Math.max(1, meses.length));
  return r;
}

/**
 * Custo para viver real: o que saiu nos fixos, flexíveis e não planejado (média dos meses dados) + os pontuais pela
 * média do plano — um IPVA ou dentista num mês não distorce (decisão do usuário).
 */
export function custoEssencialReal(c: Config, ts: Transacao[], meses: string[]): number {
  const m = mediaRealPorLinha(c, ts, meses);
  const real = Object.entries(m).reduce((s, [id, v]) => (linhaPorId(c, id)?.natureza === 'pontual' ? s : s + v), 0);
  return r2(real + totalNatureza(c, 'pontual'));
}

export interface CustoReal {
  valor: number;
  /** o mês usado (o anterior ao atual), ou vazio quando caiu no plano */
  meses: string[];
  /** 'plano' quando ainda não há mês completo com dados */
  fonte: 'real' | 'plano';
}

/**
 * Custo de verdade: o que saiu no mês passado (pontuais pela média, com o não planejado). Decisão do usuário:
 * o mês anterior, não a média — responde rápido quando o hábito melhora. É a base dos meses de liberdade
 * e de tudo que é "meses de custo". Sem lançamentos no mês passado, usa o plano.
 */
export function custoReal(c: Config, ts: Transacao[], mesAtual: string = isoMes()): CustoReal {
  const meses = mesesAnteriores(mesAtual, 1).filter((m) => despesas(doMes(ts, m)).length > 0);
  if (!meses.length) return { valor: custoEssencial(c), meses: [], fonte: 'plano' };
  return { valor: custoEssencialReal(c, ts, meses), meses, fonte: 'real' };
}

export interface ResumoMes {
  gasto: number;
  planejado: number;
  naoPlanejado: number;
  receita: number;
  /** a renda fixa */
  receitaEsperada: number;
  /** o que ainda resta do plano do mês (negativo = passou) */
  restante: number;
}

export function resumoMes(c: Config, ts: Transacao[], mes: string): ResumoMes {
  const doM = doMes(ts, mes);
  const desp = despesas(doM);
  const gasto = soma(desp.map((t) => t.valor));
  const planejado = custoEssencial(c);
  return {
    gasto,
    planejado,
    naoPlanejado: soma(desp.filter((t) => naoPlanejada(c, t)).map((t) => t.valor)),
    receita: soma(receitas(doM).map((t) => t.valor)),
    receitaEsperada: rendaFixaMensal(c),
    restante: r2(planejado - gasto),
  };
}

// ---------- Patrimônio ----------

/**
 * Patrimônio líquido = o que está no banco e investido − as dívidas (pode ficar negativo). "A receber" não entra
 * (decisão do usuário: só conta o que já está na conta). Com os bens = líquido + valor de revenda dos bens.
 */
export function resumoPatrimonio(p: Patrimonio) {
  const contas = soma(p.contas.map((x) => x.saldo));
  const dividas = soma(p.dividas.map((x) => x.valor));
  const bens = soma(p.bens.map((x) => x.valor));
  const liquido = r2(contas - dividas);
  return {
    contas,
    dividas,
    bens,
    liquido,
    total: r2(liquido + bens),
    reserva: soma(p.contas.filter((x) => x.reserva).map((x) => x.saldo)),
    emprestimos: soma(p.dividas.filter((x) => x.tipo === 'emprestimo').map((x) => x.valor)),
  };
}

/** Quantos meses você vive sem renda com o que tem. */
export function runway(liquido: number, custoMensal: number): number {
  if (custoMensal <= 0) return Infinity;
  return Math.round((Math.max(0, liquido) / custoMensal) * 10) / 10;
}

// ---------- Metas em cascata ----------

/** Média de aportes líquidos dos últimos 3 meses completos; sem histórico, usa o planejado. */
export function ritmoAporte(m: Metas, mesAtual: string, planejado: number): { valor: number; fonte: 'real' | 'plano' } {
  const meses = mesesAnteriores(mesAtual, 3);
  const comAporte = meses.filter((mes) => m.aportes.some((a) => a.data.startsWith(mes)));
  if (comAporte.length === 0) return { valor: planejado, fonte: 'plano' };
  const total = soma(m.aportes.filter((a) => meses.some((mes) => a.data.startsWith(mes))).map((a) => a.valor));
  // divide pelos meses desde o primeiro aporte (não pune quem começou agora)
  const desde = meses.length - meses.indexOf(comAporte[0]);
  return { valor: r2(total / desde), fonte: 'real' };
}

export interface EtapaCascata {
  id: string;
  nome: string;
  nota?: string;
  alvo: number;
  saldo: number;
  pct: number;
  completa: boolean;
  atual: boolean;
  mesesFaltando: number | null;
  previsao: string | null; // AAAA-MM
}

/** Id da etapa do empréstimo na cascata (não é uma meta: vem das dívidas do tipo empréstimo). */
export const EMPRESTIMO = '_emprestimo';

/** A ordem da cascata: as metas não cumpridas, com o empréstimo (se houver) logo depois de `emprestimoDepois` (sem ela, em primeiro). */
export function ordemDaCascata(m: Metas, comEmprestimo: boolean): string[] {
  const k = m.emprestimoDepois ? m.metas.findIndex((x) => x.id === m.emprestimoDepois) : -1;
  const ordem: string[] = comEmprestimo && k < 0 ? [EMPRESTIMO] : [];
  m.metas.forEach((meta, i) => {
    if (!meta.concluida) ordem.push(meta.id);
    if (comEmprestimo && i === k) ordem.push(EMPRESTIMO);
  });
  return ordem;
}

/** Tira `id` da lista e põe antes ou depois de `alvo`. */
export function reordenar<T>(lista: T[], chave: (x: T) => string, id: string, alvo: string, antes: boolean): T[] {
  const item = lista.find((x) => chave(x) === id);
  const resto = lista.filter((x) => chave(x) !== id);
  const i = resto.findIndex((x) => chave(x) === alvo);
  if (!item || i < 0) return lista;
  const j = antes ? i : i + 1;
  return [...resto.slice(0, j), item, ...resto.slice(j)];
}

/**
 * Muda a prioridade na cascata: tira `id` (uma meta ou o empréstimo) do lugar e põe antes ou depois de `alvo`.
 * As cumpridas ficam onde estão; o empréstimo guarda a meta que vem logo antes dele.
 */
export function moverNaCascata(m: Metas, id: string, alvo: string, antes: boolean, comEmprestimo: boolean): Metas {
  const nova = reordenar(ordemDaCascata(m, comEmprestimo), (x) => x, id, alvo, antes);
  const porId = new Map(m.metas.map((x) => [x.id, x]));
  const fila = nova.filter((x) => x !== EMPRESTIMO).map((x) => porId.get(x)!);
  const metas = m.metas.map((x) => (x.concluida ? x : fila.shift()!));
  if (!comEmprestimo) return { ...m, metas };
  const j = nova.indexOf(EMPRESTIMO);
  const { emprestimoDepois: _, ...resto } = m;
  return j > 0 ? { ...resto, metas, emprestimoDepois: nova[j - 1] } : { ...resto, metas };
}

/**
 * Enche as metas em ordem com o dinheiro da reserva. Se houver empréstimo, ele entra como uma etapa
 * (em primeiro, ou onde o usuário pôs; não entra se o usuário excluiu a etapa) e consome o ritmo de aporte na sua vez.
 */
export function cascataMetas(
  m: Metas,
  reserva: number,
  emprestimos: number,
  custo: number,
  ritmoMensal: number,
  mesAtual: string,
): EtapaCascata[] {
  const etapas: EtapaCascata[] = [];
  let mesesAcumulados = 0;
  let restante = Math.max(0, reserva);
  let achouAtual = false;

  const empurrar = (id: string, nome: string, alvo: number, saldo: number, faltando: number, nota?: string) => {
    const completa = faltando <= 0.005;
    const meses = completa ? 0 : ritmoMensal > 0 ? faltando / ritmoMensal : null;
    if (meses !== null) mesesAcumulados += meses;
    const mesesFaltando = completa ? 0 : meses === null ? null : Math.ceil(mesesAcumulados * 10) / 10;
    const atual = !completa && !achouAtual;
    if (atual) achouAtual = true;
    etapas.push({
      id,
      nome,
      nota,
      alvo: r2(alvo),
      saldo: r2(saldo),
      pct: alvo > 0 ? Math.min(1, saldo / alvo) : 1,
      completa,
      atual,
      mesesFaltando,
      previsao: mesesFaltando === null ? null : completa ? mesAtual : somarMeses(mesAtual, Math.ceil(mesesAcumulados)),
    });
  };

  const porId = new Map(m.metas.map((x) => [x.id, x]));
  for (const id of ordemDaCascata(m, emprestimos > 0 && !m.semEmprestimo)) {
    if (id === EMPRESTIMO) {
      empurrar(EMPRESTIMO, 'Quitar empréstimo', emprestimos, 0, emprestimos);
      continue;
    }
    const meta = porId.get(id)!;
    const alvo = meta.alvo ?? (meta.alvoMesesCusto ?? 0) * custo;
    const saldo = Math.min(alvo, restante);
    restante = r2(restante - saldo);
    empurrar(meta.id, meta.nome, alvo, saldo, alvo - saldo, meta.nota);
  }
  return etapas;
}
