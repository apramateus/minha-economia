// Números de exemplo para quem acabou de instalar: 3 meses de lançamentos fictícios até hoje, nas categorias do seed/.
// Assim o app já mostra como funciona antes de o banco ser conectado. Somem na 1ª sincronização real com o banco
// (ou com `npm run limpar-exemplo`); as categorias e as metas ficam.
import type { Patrimonio, Transacao } from './tipos.ts';

/** Sorteio repetível (o mesmo mês dá sempre os mesmos valores). */
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Modelo = { dia: number; descricao: string; linha?: string | null; min: number; max?: number; conta?: string; conhecido?: boolean };

// gasto do mês: dia, descrição do jeito que o banco manda, categoria do seed/ e faixa de valor
const TODO_MES: Modelo[] = [
  { dia: 2, descricao: 'SMART FIT', linha: 'academia', min: 99.9 },
  { dia: 3, descricao: 'SUPERMERCADO EXEMPLO', linha: 'mercado', min: 150, max: 260 },
  { dia: 4, descricao: 'UBER *TRIP', linha: 'app-transporte', min: 18, max: 40 },
  { dia: 6, descricao: 'IFOOD *RESTAURANTE', linha: 'ifood', min: 35, max: 70 },
  { dia: 7, descricao: 'POSTO SHELL', linha: 'gasolina', min: 120, max: 170 },
  { dia: 8, descricao: 'INTERNET FIBRA', linha: 'internet', min: 99.9, conta: 'conta' },
  { dia: 9, descricao: 'RESTAURANTE SABOR', linha: 'restaurante', min: 60, max: 110 },
  { dia: 10, descricao: 'SUPERMERCADO EXEMPLO', linha: 'mercado', min: 150, max: 260 },
  { dia: 10, descricao: 'PIX ENVIADO ALUGUEL', linha: 'aluguel', min: 1800, conta: 'conta' },
  { dia: 11, descricao: 'NETFLIX.COM', linha: 'assinaturas', min: 44.9 },
  { dia: 12, descricao: 'CONTA DE LUZ', linha: 'luz', min: 130, max: 170, conta: 'conta' },
  { dia: 13, descricao: 'IFOOD *LANCHONETE', linha: 'ifood', min: 35, max: 70 },
  { dia: 14, descricao: 'DROGARIA EXEMPLO', linha: 'farmacia', min: 40, max: 90 },
  { dia: 15, descricao: 'CONTA DE AGUA', linha: 'agua', min: 70, max: 90, conta: 'conta' },
  { dia: 16, descricao: 'UBER *TRIP', linha: 'app-transporte', min: 18, max: 40 },
  { dia: 17, descricao: 'SUPERMERCADO EXEMPLO', linha: 'mercado', min: 150, max: 260 },
  { dia: 18, descricao: 'SPOTIFY', linha: 'assinaturas', min: 21.9 },
  { dia: 19, descricao: 'CINEMA EXEMPLO', linha: 'lazer', min: 60, max: 90 },
  { dia: 20, descricao: 'IFOOD *PIZZARIA', linha: 'ifood', min: 45, max: 80 },
  { dia: 21, descricao: 'POSTO IPIRANGA', linha: 'gasolina', min: 120, max: 170 },
  { dia: 22, descricao: 'RESTAURANTE SABOR', linha: 'restaurante', min: 60, max: 110 },
  { dia: 24, descricao: 'SUPERMERCADO EXEMPLO', linha: 'mercado', min: 150, max: 260 },
  { dia: 25, descricao: 'BAR EXEMPLO', linha: 'lazer', min: 80, max: 140 },
  { dia: 26, descricao: 'UBER *TRIP', linha: 'app-transporte', min: 18, max: 40 },
  { dia: 27, descricao: 'IFOOD *RESTAURANTE', linha: 'ifood', min: 35, max: 70 },
];

// o que acontece só num mês (0 = este mês, -1 = o passado…): pontuais e o que ficou fora do plano
const ALGUNS_MESES: Record<number, Modelo[]> = {
  [-2]: [
    { dia: 8, descricao: 'CLINICA ODONTO EXEMPLO', linha: 'dentista', min: 180 },
    { dia: 20, descricao: 'LOJA DE PRESENTES', linha: 'presentes', min: 120 },
    { dia: 23, descricao: 'ELETRONICOS EXEMPLO', linha: null, min: 340, conhecido: true },
  ],
  [-1]: [
    { dia: 15, descricao: 'LOJA DE ROUPAS EXEMPLO', linha: 'roupas', min: 230 },
    { dia: 18, descricao: 'CONSERTO CELULAR', linha: null, min: 280, conhecido: true },
  ],
  // dois sem categoria, para mostrar o "a categorizar"
  0: [
    { dia: 3, descricao: 'PIX ENVIADO JOAO', linha: null, min: 50 },
    { dia: 5, descricao: 'LOJA ONLINE EXEMPLO', linha: null, min: 89.9 },
  ],
};

const RENDA = 5500;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Lançamentos de exemplo dos últimos 3 meses (este inclusive), só até `hoje`. */
export function lancamentosDeExemplo(hoje = new Date()): Transacao[] {
  const lista: Transacao[] = [];
  const limite = iso(hoje);
  let faturaAnterior = 0;
  for (const desloc of [-2, -1, 0]) {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + desloc, 1);
    const ultimo = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
    const sortear = sorteio(inicio.getFullYear() * 12 + inicio.getMonth());
    const mes = iso(inicio).slice(0, 7);
    let n = 0;
    let noCartao = 0;
    const lancar = (dia: number, t: Omit<Transacao, 'id' | 'data' | 'origem' | 'hash'>) => {
      const data = `${mes}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
      if (data > limite) return;
      const id = `exemplo-${mes}-${++n}`;
      lista.push({ id, data, origem: 'demo', hash: `demo:${id}`, ...t });
    };
    lancar(5, { valor: RENDA, tipo: 'receita', fonte: 'salario', descricao: 'SALARIO EMPRESA EXEMPLO', conta: 'conta' });
    for (const m of [...TODO_MES, ...(ALGUNS_MESES[desloc] ?? [])]) {
      const valor = r2(m.max ? m.min + sortear() * (m.max - m.min) : m.min);
      const conta = m.conta ?? 'cartao';
      if (conta === 'cartao') noCartao += valor;
      lancar(m.dia, { valor, tipo: 'despesa', linha: m.linha ?? null, descricao: m.descricao, conta, ...(m.conhecido ? { editado: true } : {}) });
    }
    // a fatura do mês anterior sai da conta: é transferência, não gasto
    if (faturaAnterior) lancar(1, { valor: r2(faturaAnterior), tipo: 'transferencia', descricao: 'PAGAMENTO DE FATURA', conta: 'conta' });
    faturaAnterior = noCartao;
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/** Ainda tem número de exemplo (lançamento ou item do patrimônio)? */
export function temExemplo(transacoes: Transacao[], patrimonio: Patrimonio): boolean {
  return (
    transacoes.some((t) => t.origem === 'demo') ||
    [...patrimonio.contas, ...patrimonio.dividas, ...patrimonio.bens, ...patrimonio.aReceber].some((x) => x.demo)
  );
}

/** Tira os números de exemplo: lançamentos `origem: 'demo'` e itens do patrimônio `demo: true`. */
export function semExemplo(transacoes: Transacao[], patrimonio: Patrimonio): { transacoes: Transacao[]; patrimonio: Patrimonio } {
  return {
    transacoes: transacoes.filter((t) => t.origem !== 'demo'),
    patrimonio: {
      ...patrimonio,
      contas: patrimonio.contas.filter((c) => !c.demo),
      dividas: patrimonio.dividas.filter((d) => !d.demo),
      bens: patrimonio.bens.filter((b) => !b.demo),
      aReceber: patrimonio.aReceber.filter((a) => !a.demo),
    },
  };
}
