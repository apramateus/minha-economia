// Transforma um arquivo de banco em transações do app: detecta o formato,
// aplica as regras de categoria e marca o que já foi importado antes.
import { novoId } from '../id.ts';
import { r2 } from '../calculos.ts';
import type { Config, Regra, TipoTransacao, Transacao, FonteReceita } from '../tipos.ts';
import {
  adivinharMapeamento,
  ehOFX,
  lerCSV,
  lerOFX,
  linhasDoCSV,
  mapeamentoC6Fatura,
  normalizar,
  nucleoDescricao,
  type LinhaBruta,
  type Mapeamento,
} from './formatos.ts';

export { decodificar, normalizar, type LinhaBruta, type Mapeamento } from './formatos.ts';

export type Formato = 'ofx' | 'c6-fatura' | 'csv';

export interface ArquivoLido {
  formato: Formato;
  contaSugerida: string | null;
  /** só para CSV */
  tabela?: string[][];
  mapeamento?: Partial<Mapeamento>;
  linhas: LinhaBruta[] | null; // null = CSV sem colunas reconhecidas, precisa mapear
}

/** A primeira conta do tipo pedido entre as que existem (ou só "conta"/"cartao", se ainda não há nenhuma). */
export function contaPadrao(tipo: 'conta' | 'cartao', existentes: string[] = []): string {
  return existentes.find((id) => contaEhCartao(id) === (tipo === 'cartao')) ?? tipo;
}

/** `contas` = ids das contas que já existem, para sugerir onde o arquivo entra. */
export function lerArquivo(texto: string, contas: string[] = []): ArquivoLido {
  if (ehOFX(texto)) return { formato: 'ofx', contaSugerida: contaPadrao('conta', contas), linhas: lerOFX(texto) };
  const tabela = lerCSV(texto);
  const cab = tabela[0] ?? [];
  const c6 = mapeamentoC6Fatura(cab);
  if (c6) return { formato: 'c6-fatura', contaSugerida: contaPadrao('cartao', contas), tabela, mapeamento: c6, linhas: linhasDoCSV(tabela, c6) };
  const palpite = adivinharMapeamento(cab);
  const completo = palpite.data !== undefined && palpite.descricao !== undefined && palpite.valor !== undefined;
  return {
    formato: 'csv',
    contaSugerida: null,
    tabela,
    mapeamento: palpite,
    linhas: completo ? linhasDoCSV(tabela, { ...(palpite as Mapeamento), positivoEhGasto: false }) : null,
  };
}

// ---------- Regras ----------

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A regra casa no começo de uma palavra: "POSTO" pega "AUTO POSTO", mas não "IMPOSTO".
 * Com faixa de valor (valorMin/valorMax), só casa se o valor estiver nela — sem valor, não casa.
 */
export function regraCasa(regra: Regra, descricao: string, valor?: number): boolean {
  const p = normalizar(regra.padrao);
  if (!p) return false;
  if (regra.valorMin !== undefined || regra.valorMax !== undefined) {
    if (valor === undefined) return false;
    const v = Math.abs(valor);
    if ((regra.valorMin !== undefined && v < regra.valorMin) || (regra.valorMax !== undefined && v > regra.valorMax)) return false;
  }
  return new RegExp(`(^|[^A-Z0-9])${escapar(p)}`).test(normalizar(descricao));
}

export function acharRegra(regras: Regra[], descricao: string, valor?: number): Regra | undefined {
  return regras.find((r) => regraCasa(r, descricao, valor));
}

export function contaEhCartao(conta: string): boolean {
  return /cartao|card|fatura/i.test(conta);
}

export interface Classificacao {
  tipo: TipoTransacao;
  linha: string | null;
  fonte?: FonteReceita;
  valor: number; // sem sinal; estorno de cartão vira despesa negativa
}

/** Categorias do Open Finance que são dinheiro mudando de lugar, não gasto. Valem quando nenhuma regra casou. */
export const CATEGORIAS_TRANSFERENCIA = ['Credit card payment', 'Same person transfer'];

export function classificar(l: LinhaBruta, conta: string, regras: Regra[], config: Config): Classificacao {
  const regra = acharRegra(regras, l.detalhe ? `${l.descricao} ${l.detalhe}` : l.descricao, l.valor);
  const linhaValida = regra?.linha && config.orcamento.some((x) => x.id === regra.linha) ? regra.linha : null;
  const abs = r2(Math.abs(l.valor));

  if (regra?.tipo === 'transferencia' || (!regra && l.categoriaBanco && CATEGORIAS_TRANSFERENCIA.includes(l.categoriaBanco))) {
    return { tipo: 'transferencia', linha: null, valor: abs };
  }
  if (l.valor < 0 || regra?.tipo === 'despesa') return { tipo: 'despesa', linha: linhaValida, valor: abs };
  // entrou dinheiro
  if (contaEhCartao(conta)) return { tipo: 'despesa', linha: linhaValida, valor: -abs }; // estorno
  return { tipo: 'receita', linha: null, fonte: regra?.fonte ?? 'outros', valor: abs };
}

// ---------- Duplicatas ----------

/** Hash estável: mesma linha do mesmo arquivo gera sempre o mesmo hash (inclui a ordem entre linhas iguais). */
export function gerarHashes(linhas: LinhaBruta[], conta: string): string[] {
  const vistos = new Map<string, number>();
  return linhas.map((l) => {
    if (l.hash) return l.hash;
    if (l.idExterno) return `ofx:${conta}:${l.idExterno}`;
    const base = `${conta}|${l.data}|${l.valor.toFixed(2)}|${normalizar(l.descricao)}`;
    const k = vistos.get(base) ?? 0;
    vistos.set(base, k + 1);
    return `${base}#${k}`;
  });
}

export interface LinhaPrevia {
  transacao: Transacao;
  /** mesmo hash de uma transação já importada (a existente vem em `existente`) */
  duplicada: boolean;
  existente?: Transacao;
  /** parece algo que já está lá por outro caminho: lançado à mão (até 7 dias) ou importado de outro formato (até 3 dias) */
  jaLancada?: Transacao;
}

const DIA_MS = 86_400_000;
const distanciaDias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DIA_MS;

/** De que tipo de fonte veio um hash: pluggy, ofx ou csv. */
export function familiaHash(hash: string): string {
  const m = hash.match(/^(pluggy|ofx):/);
  return m ? m[1] : 'csv';
}

export function montarPrevia(
  linhas: LinhaBruta[],
  conta: string,
  regras: Regra[],
  config: Config,
  existentes: Transacao[],
  origem: Transacao['origem'] = 'import',
): LinhaPrevia[] {
  const porHash = new Map(existentes.filter((t) => t.hash).map((t) => [t.hash!, t]));
  const hashes = gerarHashes(linhas, conta);
  const familia = hashes.length ? familiaHash(hashes[0]) : 'csv';
  // candidatas a "já está lá": lançamentos à mão e importações de outro formato na mesma conta
  const candidatas = existentes.filter(
    (t) => t.origem === 'manual' || (t.hash && t.conta === conta && familiaHash(t.hash) !== familia),
  );
  const usadas = new Set<string>();
  return linhas.map((l, i) => {
    const c = classificar(l, conta, regras, config);
    const transacao: Transacao = {
      id: novoId(),
      data: l.data,
      valor: c.valor,
      tipo: c.tipo,
      linha: c.linha,
      ...(c.fonte ? { fonte: c.fonte } : {}),
      descricao: l.descricao,
      conta,
      origem,
      hash: hashes[i],
    };
    if (l.categoriaBanco) transacao.categoriaBanco = l.categoriaBanco;
    const existente = porHash.get(hashes[i]);
    const duplicada = !!existente;
    let jaLancada: Transacao | undefined;
    if (!duplicada && c.tipo !== 'transferencia') {
      jaLancada = candidatas.find(
        (m) =>
          !usadas.has(m.id) &&
          m.tipo === c.tipo &&
          Math.abs((m.valorBanco ?? m.valor) - c.valor) < 0.01 &&
          distanciaDias(m.dataBanco ?? m.data, l.data) <= (m.origem === 'manual' ? 7 : 3),
      );
      if (jaLancada) {
        usadas.add(jaLancada.id);
        // herda a categoria que você escolheu à mão
        transacao.linha = jaLancada.linha ?? transacao.linha;
      }
    }
    return { transacao, duplicada, ...(existente ? { existente } : {}), ...(jaLancada ? { jaLancada } : {}) };
  });
}

/**
 * Reaplica as regras a uma transação já importada (depois de criar regras novas).
 * Não mexe no que foi lançado à mão nem no que você editou.
 */
export function reclassificar(t: Transacao, regras: Regra[], config: Config): Transacao {
  if (t.origem === 'manual' || t.editado) return t;
  const regra = acharRegra(regras, t.descricao, t.valorBanco ?? t.valor);
  const porCategoria = !regra && !!t.categoriaBanco && CATEGORIAS_TRANSFERENCIA.includes(t.categoriaBanco);
  if (regra?.tipo === 'transferencia' || porCategoria) {
    if (t.tipo === 'transferencia') return t;
    const { fonte: _f, ...resto } = t;
    return { ...resto, tipo: 'transferencia', linha: null };
  }
  if (!regra) return t;
  if (t.tipo === 'receita' && regra.fonte && t.fonte !== regra.fonte) return { ...t, fonte: regra.fonte };
  if (t.tipo === 'despesa' && regra.linha && regra.linha !== t.linha && config.orcamento.some((x) => x.id === regra.linha)) {
    return { ...t, linha: regra.linha };
  }
  return t;
}

const NAO_E_NOME = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'LTDA', 'EPP', 'ME', 'SA', 'EIRELI', 'COMERCIO', 'CIA']);

/**
 * Sugestão de padrão para uma regra nova: as duas primeiras palavras do nome do estabelecimento
 * ("Pix enviado para JOAO CARLOS DA SILVA" → "JOAO CARLOS"). Uma palavra só pegaria
 * coisa demais (PAULO, CASA, MERCADO). O padrão precisa aparecer do jeito que está na descrição.
 */
export function sugerirPadrao(descricao: string): string {
  const d = normalizar(descricao);
  const [a, b] = nucleoDescricao(descricao).split(' ').filter(Boolean);
  const candidatos = a ? [...(b && b.length >= 2 && !NAO_E_NOME.has(b) ? [`${a} ${b}`] : []), a] : [];
  // palavra inteira: "MERCADO" não serve para "MERCADOLIVRE*…" (pegaria todo mercado)
  const inteira = (p: string) => new RegExp(`(^|[^A-Z0-9])${escapar(p)}([^A-Z0-9]|$)`).test(d);
  return candidatos.find(inteira) ?? d.split(/[^A-Z0-9.]+/).find((p) => p.length >= 3 && !/^[\d.]+$/.test(p)) ?? d.slice(0, 20);
}
