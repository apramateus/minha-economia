// Converte transações e contas da Pluggy (Open Finance) para o formato do app.
// Puro (sem o SDK) para poder testar; quem chama a API é server/pluggy.ts.
import { isoDia } from '../datas.ts';
import type { LinhaBruta } from './formatos.ts';
import type { Transacao } from '../tipos.ts';

/** Só os campos que usamos de `Transaction` do pluggy-sdk. */
export interface TransacaoPluggy {
  id: string;
  date: string | Date;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status?: 'PENDING' | 'POSTED';
  category?: string | null;
  merchant?: { name?: string; businessName?: string } | null;
  creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } | null;
}

export interface ContaPluggy {
  id: string;
  type: 'BANK' | 'CREDIT';
  subtype?: string;
  name: string;
  marketingName?: string | null;
  number?: string;
  balance: number;
}

/**
 * Sinal: no app, negativo = dinheiro saiu.
 * - Conta (BANK): DEBIT sai, CREDIT entra.
 * - Cartão (CREDIT): a Pluggy manda compras positivas e pagamentos/estornos negativos — invertemos.
 */
export function linhaDaPluggy(t: TransacaoPluggy, tipoConta: ContaPluggy['type']): LinhaBruta {
  const abs = Math.abs(t.amount);
  const valor = tipoConta === 'CREDIT' ? -t.amount : t.type === 'DEBIT' ? -abs : abs;
  const cc = t.creditCardMetadata;
  const parcela = cc?.totalInstallments && cc.totalInstallments > 1 ? ` (${cc.installmentNumber ?? '?'}/${cc.totalInstallments})` : '';
  const extras = [t.descriptionRaw, t.merchant?.name, t.merchant?.businessName].filter(
    (x): x is string => !!x && x.trim() !== '' && x !== t.description,
  );
  return {
    data: isoDia(new Date(t.date)),
    valor,
    descricao: (t.description || t.descriptionRaw || 'Sem descrição') + parcela,
    hash: `pluggy:${t.id}`,
    ...(extras.length ? { detalhe: [...new Set(extras)].join(' ') } : {}),
    ...(t.category ? { categoriaBanco: t.category } : {}),
  };
}

/**
 * O que atualizar numa transação já importada quando o banco a manda de novo
 * (pendente → lançada pode mudar valor e data). Se você mudou a data ou o valor, o seu fica:
 * o banco só atualiza `dataBanco` / `valorBanco`.
 */
export function atualizacaoDoBanco(e: Transacao, banco: Pick<Transacao, 'valor' | 'data'>): Partial<Transacao> | null {
  if (e.origem === 'manual') return null;
  const m: Partial<Transacao> = {};
  if (Math.abs((e.valorBanco ?? e.valor) - banco.valor) > 0.009) {
    if (e.valorBanco !== undefined) m.valorBanco = banco.valor;
    else m.valor = banco.valor;
  }
  if ((e.dataBanco ?? e.data) !== banco.data) {
    if (e.dataBanco) m.dataBanco = banco.data;
    else m.data = banco.data;
  }
  return Object.keys(m).length ? m : null;
}

/**
 * Qual conta do app corresponde a uma conta da Pluggy. Usa o mapeamento salvo;
 * na primeira vez, a primeira conta corrente vira `conta` e o primeiro cartão `cartao`; as seguintes, `conta-1234`/`cartao-1234`
 * (final do número). Contas já mapeadas (inclusive com ids antigos) continuam como estão.
 */
export function contaDoApp(conta: ContaPluggy, mapa: Record<string, string>): string {
  if (mapa[conta.id]) return mapa[conta.id];
  const usados = new Set(Object.values(mapa));
  const padrao = conta.type === 'CREDIT' ? 'cartao' : 'conta';
  if (!usados.has(padrao)) return padrao;
  const final = (conta.number ?? conta.id).replace(/\D/g, '').slice(-4) || conta.id.slice(0, 4);
  return `${conta.type === 'CREDIT' ? 'cartao' : 'conta'}-${final}`;
}
