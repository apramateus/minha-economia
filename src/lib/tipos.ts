// Formato dos arquivos em data/*.json. Todos os valores em reais (R$), sempre positivos;
// o `tipo` da transação diz se o dinheiro entrou, saiu ou só mudou de lugar.

/** Tipo da categoria (como a Monarch): fixo = todo mês igual; flexível = varia; pontual = irregular (valor = média mensal). */
export type Natureza = 'fixo' | 'flexivel' | 'pontual';

/** Formato antigo (antes da árvore); só a migração usa. */
export type GrupoAntigo = 'fixo' | 'alimentacao' | 'estimado' | 'diversao';

export interface LinhaOrcamento {
  id: string;
  nome: string;
  /** planejado por mês só desta categoria (o que está dentro dela soma à parte) */
  valor: number;
  natureza: Natureza;
  /** categoria dentro da qual esta fica (null = nível principal); qualquer categoria pode ter outras dentro */
  pai: string | null;
  nota?: string;
}

/** Uma fonte de renda fixa, que o usuário informa (ex.: Salário, R$ 5.000). */
export interface RendaFixa {
  id: string;
  nome: string;
  valor: number; // por mês
}

export interface Config {
  /** o que o usuário conta receber todo mês; a renda média sai dos lançamentos */
  rendaFixa: RendaFixa[];
  /** categorias (uma árvore: `pai` aponta para a de cima) */
  orcamento: LinhaOrcamento[];
  saida: { runwayMeses: number; negocioPctCusto: number; mesesSeguidos: number };
  antiImpulso: { limite: number; horas: number };
  /** meta de patrimônio líquido do Início, em R$ (sem = R$ 50 mil) */
  metaPatrimonio?: number;
  /** id da conta na Pluggy → id da conta no app (preenchido na 1ª sincronização) */
  pluggy?: { contas: Record<string, string> };
}

export type TipoTransacao = 'despesa' | 'receita' | 'transferencia';
export type FonteReceita = 'salario' | 'bonus' | 'freela' | 'negocio' | 'outros';

export interface Transacao {
  id: string;
  data: string; // YYYY-MM-DD
  valor: number;
  tipo: TipoTransacao;
  /** id da LinhaOrcamento; null/ausente = não planejado */
  linha?: string | null;
  fonte?: FonteReceita; // só para receitas
  descricao: string;
  conta: string;
  /** demo = número de exemplo de quem acabou de instalar (some ao conectar o banco) */
  origem: 'manual' | 'import' | 'claude' | 'demo';
  hash?: string;
  /** categoria que o banco/Open Finance deu (ajuda nas análises) */
  categoriaBanco?: string;
  /** você mudou a categoria à mão — regras novas não mexem mais nela */
  editado?: boolean;
  /**
   * Data em que saiu do banco, quando você moveu o lançamento para o mês a que ele pertence
   * (ex.: aluguel de setembro pago em 28/08). `data` é a sua; a sincronização atualiza só esta.
   */
  dataBanco?: string;
  /**
   * Valor que saiu do banco, quando você mudou o valor (ex.: aluguel de R$ 2.500 = R$ 2.000 de aluguel + R$ 500 de caução,
   * que é depósito e virou uma transferência à parte). A sincronização atualiza só este.
   */
  valorBanco?: number;
}

export interface Meta {
  id: string;
  nome: string;
  alvo?: number;
  /** alvo = N meses do custo essencial (ex.: Fundo de Liberdade) */
  alvoMesesCusto?: number;
  concluida?: boolean; // ex.: notebook comprado — sai da cascata
  nota?: string;
}

export interface Aporte {
  id: string;
  data: string;
  valor: number; // negativo = resgate
  nota?: string;
}

export interface Metas {
  metas: Meta[];
  aportes: Aporte[];
  /** a etapa "Quitar empréstimo" vem logo depois desta meta (sem = em primeiro); muda arrastando nas Metas */
  emprestimoDepois?: string;
  /** a etapa "Quitar empréstimo" foi excluída das metas (a dívida continua em Dívidas) */
  semEmprestimo?: boolean;
}

export interface Conta {
  id: string;
  nome: string;
  saldo: number;
  /** dinheiro guardado que enche as metas em cascata */
  reserva: boolean;
  nota?: string;
  /** número de exemplo (some ao conectar o banco) */
  demo?: boolean;
}

export interface Item {
  id: string;
  nome: string;
  valor: number;
  nota?: string;
  /** número de exemplo (some ao conectar o banco) */
  demo?: boolean;
}

export interface Divida extends Item {
  tipo: 'emprestimo' | 'fatura' | 'outra';
}

export interface Snapshot {
  mes: string; // YYYY-MM
  data: string;
  liquido: number;
  reserva: number;
  bens: number;
  total: number;
  gasto: number;
  naoPlanejado: number;
  receita: number;
}

export interface Patrimonio {
  contas: Conta[];
  aReceber: Item[];
  bens: Item[];
  dividas: Divida[];
  snapshots: Snapshot[];
  /** última sincronização com o banco (ISO) */
  sincronizadoEm?: string;
  /** cada conexão com o banco (item do Meu Pluggy), como estava na última sincronização */
  conexoes?: ConexaoBanco[];
}

/** O Meu Pluggy busca cada conexão no banco 1× por dia, no horário dele: quando buscou e quando busca de novo. */
export interface ConexaoBanco {
  /** a conta corrente da conexão (ex.: "C6 PJ") */
  nome: string;
  /** quando o banco mandou os dados pela última vez (ISO) */
  atualizadoEm: string | null;
  /** quando a Pluggy vai buscar de novo (ISO) */
  proximaEm: string | null;
}

export interface Regra {
  padrao: string;
  linha?: string;
  tipo?: TipoTransacao;
  fonte?: FonteReceita;
  /** só vale nessa faixa de valor (ex.: FARMACIA a partir de R$ 150 = remédio) */
  valorMin?: number;
  valorMax?: number;
}

export interface Desejo {
  id: string;
  nome: string;
  valor: number;
  criadoEm: string; // ISO datetime
  status: 'esperando' | 'comprado' | 'desistiu';
  fechadoEm?: string;
}

export interface Dados {
  config: Config;
  transacoes: Transacao[];
  metas: Metas;
  patrimonio: Patrimonio;
  regras: Regra[];
  desejos: Desejo[];
}

export type NomeArquivo = keyof Dados;
export const ARQUIVOS: NomeArquivo[] = ['config', 'transacoes', 'metas', 'patrimonio', 'regras', 'desejos'];
