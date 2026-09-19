// Sincronização com o banco via Meu Pluggy (Open Finance, somente leitura).
// Credenciais ficam em .env.local (fora do git) e nunca vão para o navegador.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PluggyClient } from 'pluggy-sdk';
import { RAIZ, gravar, lerTudo } from './armazenamento.ts';
import { isoDia, isoMes, somarMeses } from '../src/lib/datas.ts';
import { linhaPorId, r2 } from '../src/lib/calculos.ts';
import { contaEhCartao, montarPrevia } from '../src/lib/importar/index.ts';
import { atualizacaoDoBanco, contaDoApp, linhaDaPluggy, type ContaPluggy, type TransacaoPluggy } from '../src/lib/importar/pluggy.ts';
import { semExemplo } from '../src/lib/exemplo.ts';
import type { Transacao } from '../src/lib/tipos.ts';

interface Credenciais {
  clientId: string;
  clientSecret: string;
  itemIds: string[];
  /** PLUGGY_ITEM_ID_NOVO: item em teste, só entra na simulação (--novo) até ser conferido */
  itemNovo?: string;
}

async function lerEnvLocal(): Promise<Record<string, string>> {
  try {
    const texto = await fs.readFile(path.join(RAIZ, '.env.local'), 'utf8');
    const r: Record<string, string> = {};
    for (const linha of texto.split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) r[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return r;
  } catch {
    return {};
  }
}

export async function lerCredenciais(): Promise<{ credenciais: Credenciais | null; faltando: string[] }> {
  const env = { ...(await lerEnvLocal()), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('PLUGGY_'))) };
  const clientId = env.PLUGGY_CLIENT_ID ?? '';
  const clientSecret = env.PLUGGY_CLIENT_SECRET ?? '';
  const itemIds = (env.PLUGGY_ITEM_IDS ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const faltando = [
    ...(clientId ? [] : ['PLUGGY_CLIENT_ID']),
    ...(clientSecret ? [] : ['PLUGGY_CLIENT_SECRET']),
    ...(itemIds.length ? [] : ['PLUGGY_ITEM_IDS']),
  ];
  const itemNovo = (env.PLUGGY_ITEM_ID_NOVO ?? '').trim();
  return {
    credenciais: faltando.length ? null : { clientId, clientSecret, itemIds, ...(itemNovo && !itemIds.includes(itemNovo) ? { itemNovo } : {}) },
    faltando,
  };
}

export interface RelatorioConta {
  /** começo do Item ID de onde veio */
  item: string;
  /** últimos dígitos do número da conta/cartão (para saber se é a mesma conta vista por dois itens) */
  final: string;
  nome: string;
  tipo: 'BANK' | 'CREDIT';
  conta: string;
  saldo: number;
  desde: string;
  recebidas: number;
  novas: number;
  atualizadas: number;
  jaExistiam: number;
}

export interface RelatorioSincronizacao {
  simulado: boolean;
  itens: { id: string; status: string; ultimaAtualizacaoBanco: string | null; consentimentoExpiraEm: string | null }[];
  contas: RelatorioConta[];
  novas: number;
  semCategoria: { data: string; descricao: string; valor: number }[];
  /** soma dos investimentos ativos (CDBs etc.) */
  investimentos: number | null;
  avisos: string[];
}

const DIAS_SOBREPOSICAO = 10;

/** O pedaço do PluggyClient que usamos (dá para trocar por um falso nos testes). */
export type ClienteBanco = Pick<PluggyClient, 'fetchItem' | 'fetchAccounts' | 'fetchAllTransactions' | 'fetchInvestments'>;

let emAndamento: Promise<RelatorioSincronizacao> | null = null;

/**
 * Evita duas sincronizações ao mesmo tempo (ex.: Mac e iPhone abrindo o app juntos).
 * `novo`: inclui o PLUGGY_ITEM_ID_NOVO, sempre em simulação (para conferir antes de gravar).
 */
export function sincronizar(opcoes: { simular?: boolean; novo?: boolean } = {}): Promise<RelatorioSincronizacao> {
  if (!emAndamento) {
    emAndamento = (async () => {
      const { credenciais, faltando } = await lerCredenciais();
      if (!credenciais) throw new Error(`Falta preencher no .env.local: ${faltando.join(', ')}`);
      if (opcoes.novo && !credenciais.itemNovo) throw new Error('O PLUGGY_ITEM_ID_NOVO do .env.local está vazio (ou repete um dos PLUGGY_ITEM_IDS).');
      const cliente = new PluggyClient({ clientId: credenciais.clientId, clientSecret: credenciais.clientSecret });
      const ids = opcoes.novo ? [...credenciais.itemIds, credenciais.itemNovo!] : credenciais.itemIds;
      return sincronizarCom(cliente, ids, { simular: opcoes.simular || opcoes.novo });
    })().finally(() => (emAndamento = null));
  }
  return emAndamento;
}

export async function sincronizarCom(
  cliente: ClienteBanco,
  itemIds: string[],
  { simular = false }: { simular?: boolean } = {},
): Promise<RelatorioSincronizacao> {
  const dados = await lerTudo();
  const { config, regras } = dados;
  const mapa = { ...(config.pluggy?.contas ?? {}) };
  // os números de exemplo de quem acabou de instalar saem aqui: o banco real entra no lugar deles
  const reais = semExemplo(dados.transacoes, dados.patrimonio);
  let transacoes = [...reais.transacoes];
  let patrimonio = structuredClone(reais.patrimonio);
  const relatorio: RelatorioSincronizacao = { simulado: simular, itens: [], contas: [], novas: 0, semCategoria: [], investimentos: null, avisos: [] };
  const primeiraVez = `${somarMeses(isoMes(), -3)}-01`; // 3 meses de histórico + o mês atual

  for (const itemId of itemIds) {
    const item = await cliente.fetchItem(itemId);
    const expira = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;
    relatorio.itens.push({
      id: itemId,
      status: item.status,
      ultimaAtualizacaoBanco: item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toISOString() : null,
      consentimentoExpiraEm: expira ? expira.toISOString() : null,
    });
    if (['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_ACTION', 'WAITING_USER_INPUT'].includes(item.status)) {
      relatorio.avisos.push(`A conexão ${itemId.slice(0, 8)} está com status ${item.status}: reconecte o banco no Meu Pluggy.`);
    }
    if (expira && expira.getTime() - Date.now() < 30 * 86_400_000) {
      relatorio.avisos.push(`O consentimento do Open Finance vence em ${isoDia(expira)}. Renove no app do banco ou no Meu Pluggy.`);
    }

    const { results: contasPluggy } = await cliente.fetchAccounts(itemId);
    const contasDoItem: string[] = [];
    for (const cp of contasPluggy as ContaPluggy[]) {
      const conta = contaDoApp(cp, mapa);
      mapa[cp.id] = conta;
      contasDoItem.push(conta);

      const ultimas = transacoes.filter((t) => t.conta === conta && t.hash?.startsWith('pluggy:')).map((t) => t.dataBanco ?? t.data);
      const desde = ultimas.length
        ? isoDia(new Date(Date.parse(ultimas.sort().at(-1)!) - DIAS_SOBREPOSICAO * 86_400_000))
        : primeiraVez;

      const brutas = (await cliente.fetchAllTransactions(cp.id, { dateFrom: desde })) as unknown as TransacaoPluggy[];
      const linhas = brutas.map((t) => linhaDaPluggy(t, cp.type));
      const previa = montarPrevia(linhas, conta, regras, config, transacoes);

      const novas = previa.filter((p) => !p.duplicada && !p.jaLancada).map((p) => p.transacao);
      // pendente → lançada pode mudar valor/data; mantém categoria, descrição e a data que você escolheu
      const mudancas = new Map<string, Partial<Transacao>>();
      for (const p of previa) {
        const m = p.existente && atualizacaoDoBanco(p.existente, p.transacao);
        if (m) mudancas.set(p.existente!.id, m);
      }
      transacoes = transacoes.map((t) => (mudancas.has(t.id) ? { ...t, ...mudancas.get(t.id)! } : t)).concat(novas);

      relatorio.contas.push({
        item: itemId.slice(0, 8),
        final: (cp.number ?? '').replace(/\D/g, '').slice(-4),
        nome: cp.marketingName || cp.name,
        tipo: cp.type,
        conta,
        saldo: cp.balance,
        desde,
        recebidas: brutas.length,
        novas: novas.length,
        atualizadas: mudancas.size,
        jaExistiam: previa.length - novas.length,
      });
      relatorio.novas += novas.length;
      relatorio.semCategoria.push(
        ...novas
          .filter((t) => t.tipo === 'despesa' && !linhaPorId(config, t.linha))
          .map((t) => ({ data: t.data, descricao: t.descricao, valor: t.valor })),
      );

      // saldos reais do banco
      if (cp.type === 'BANK') {
        const existe = patrimonio.contas.some((c) => c.id === conta);
        patrimonio.contas = existe
          ? patrimonio.contas.map((c) => (c.id === conta ? { ...c, saldo: r2(cp.balance) } : c))
          : [...patrimonio.contas, { id: conta, nome: cp.marketingName || cp.name, saldo: r2(cp.balance), reserva: false }];
        const reservas = (cp as ContaPluggy & { bankData?: { reservedBalances?: { availableAmounts: { amount: number }[] }[] | null } })
          .bankData?.reservedBalances;
        if (reservas?.length) {
          const total = r2(reservas.flatMap((x) => x.availableAmounts).reduce((s, a) => s + a.amount, 0));
          relatorio.avisos.push(`Encontrei ${reservas.length} caixinha(s) na conta somando R$ ${total.toFixed(2)}.`);
        }
      } else {
        // `fatura-c6`: id de instalações antigas; só vale se já existir nos dados
        const antigo = conta === 'c6-cartao' && patrimonio.dividas.some((d) => d.id === 'fatura-c6');
        const id = antigo ? 'fatura-c6' : `fatura-${conta}`;
        // o Open Finance às vezes manda saldo 0; o limite usado (limite − disponível) é o que você deve no cartão
        const credito = (cp as ContaPluggy & { creditData?: { creditLimit?: number | null; availableCreditLimit?: number | null } | null }).creditData;
        const usado = credito?.creditLimit != null && credito.availableCreditLimit != null ? credito.creditLimit - credito.availableCreditLimit : 0;
        const valor = r2(Math.max(0, cp.balance, usado));
        const existe = patrimonio.dividas.some((d) => d.id === id);
        // cartão sem uso (ex.: o da PJ) não vira uma "dívida de R$ 0" na lista
        if (existe) patrimonio.dividas = patrimonio.dividas.map((d) => (d.id === id ? { ...d, valor } : d));
        else if (valor > 0) patrimonio.dividas = [...patrimonio.dividas, { id, nome: `Fatura ${cp.marketingName || cp.name}`, valor, tipo: 'fatura' as const }];
      }
    }

    // investimentos (CDB de garantia do cartão, caixinhas…): soma dos ativos
    try {
      const { results: inv } = await cliente.fetchInvestments(itemId);
      const ativos = inv.filter((i) => i.status !== 'TOTAL_WITHDRAWAL' && i.balance > 0);
      const total = r2(ativos.reduce((s, i) => s + i.balance, 0));
      relatorio.investimentos = r2((relatorio.investimentos ?? 0) + total);
      // cada item tem os seus, numa conta própria (`c6-cdb-cartao`: id de instalações antigas, só se já existir)
      const primeiro = itemIds.indexOf(itemId) === 0;
      const dono = contasDoItem.find((c) => !contaEhCartao(c));
      const antigo = primeiro && patrimonio.contas.some((c) => c.id === 'c6-cdb-cartao');
      const id = antigo ? 'c6-cdb-cartao' : `investimentos-${dono ?? itemId.slice(0, 8)}`;
      const nome = `Investimentos ${patrimonio.contas.find((c) => c.id === dono)?.nome ?? ''}`.trim();
      const existe = patrimonio.contas.some((c) => c.id === id);
      if (existe) patrimonio.contas = patrimonio.contas.map((c) => (c.id === id ? { ...c, saldo: total } : c));
      else if (total > 0) patrimonio.contas = [...patrimonio.contas, { id, nome, saldo: total, reserva: false }];
    } catch (e) {
      relatorio.avisos.push(`Não consegui ler os investimentos: ${(e as Error).message}`);
    }
  }

  if (!simular) {
    patrimonio = { ...patrimonio, sincronizadoEm: new Date().toISOString() };
    await gravar('transacoes', transacoes.sort((a, b) => a.data.localeCompare(b.data)));
    await gravar('patrimonio', patrimonio);
    await gravar('config', { ...config, pluggy: { contas: mapa } });
  }
  return relatorio;
}
