// Categorias: uma árvore livre — qualquer categoria pode ficar dentro de outra, em qualquer profundidade,
// e o usuário cria, põe dentro, junta e exclui como quiser (lista da aba Gastos).
// A árvore diz o assunto; o tipo de cada uma (fixo / flexível / pontual, como na Monarch) diz o comportamento.
import { normalizar } from './importar/formatos.ts';
import { reclassificar, regraCasa } from './importar/index.ts';
import type { Config, GrupoAntigo, LinhaOrcamento, Natureza, Regra, Transacao } from './tipos.ts';

export const NATUREZAS: { id: Natureza; nome: string; dica: string }[] = [
  { id: 'fixo', nome: 'Fixo', dica: 'mais ou menos o mesmo valor todo mês (aluguel, contas, assinaturas)' },
  { id: 'flexivel', nome: 'Flexível', dica: 'muda de mês para mês (mercado, comida, lazer)' },
  { id: 'pontual', nome: 'Pontual', dica: 'grande ou irregular, não é todo mês (IPVA, dentista, presentes); o plano é a média por mês' },
];

const TIPOS_ATUAIS = new Set<string>(NATUREZAS.map((n) => n.id));

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------- Migração ----------
// 1º formato: `grupo` fixo/alimentacao/estimado/diversao. 2º: pastas à parte em `config.grupos`.
// Agora a pasta é uma categoria como as outras (plano próprio 0): dá para pôr qualquer uma dentro de qualquer outra.

type PastaAntiga = { id: string; nome: string; pai: string | null };

/** Ponto de partida por assunto (escolha do usuário). Ele reorganiza como quiser. */
const ARVORE_INICIAL: PastaAntiga[] = [
  { id: 'casa', nome: 'Casa', pai: null },
  { id: 'contas-da-casa', nome: 'Contas da casa', pai: 'casa' },
  { id: 'comida', nome: 'Comida', pai: null },
  { id: 'saude', nome: 'Saúde', pai: null },
  { id: 'trabalho', nome: 'Trabalho', pai: null },
  { id: 'transporte', nome: 'Transporte', pai: null },
  { id: 'pessoal', nome: 'Pessoal', pai: null },
];

const PASTA_INICIAL: Record<string, string> = {
  aluguel: 'casa',
  mercado: 'casa',
  luz: 'contas-da-casa',
  agua: 'contas-da-casa',
  internet: 'contas-da-casa',
  'almoco-fora': 'comida',
  ifood: 'comida',
  remedio: 'saude',
  farmacia: 'saude',
  dentista: 'saude',
  academia: 'saude',
  ferramentas: 'trabalho',
  contador: 'trabalho',
  gasolina: 'transporte',
  moto: 'transporte',
  celular: 'pessoal',
  assinaturas: 'pessoal',
  presentes: 'pessoal',
};

type LinhaTalvezAntiga = Omit<LinhaOrcamento, 'natureza' | 'pai'> & {
  /** antigos: 'variavel' e 'diversao' (viraram flexível) */
  natureza?: Natureza | 'variavel' | 'diversao';
  pai?: string | null;
  grupo?: GrupoAntigo;
  /** antigo "pode gastar hoje" (removido a pedido do usuário) */
  diario?: boolean;
  /** antigos: conta/envelope e dia de vencimento (nada usava) */
  tipo?: 'conta' | 'envelope';
  dia?: number;
};
type ConfigTalvezAntiga = Omit<Config, 'orcamento' | 'rendaFixa'> & {
  orcamento: LinhaTalvezAntiga[];
  grupos?: PastaAntiga[];
  rendaFixa?: Config['rendaFixa'];
  /** antigo: salário + bônus trimestral − imposto (virou a renda fixa) */
  renda?: { salario: number; bonusTrimestral: number };
  /** antigos: meta de pedidos do iFood e regra do freela (removidos a pedido do usuário) */
  ifood?: unknown;
  freela?: unknown;
};

/**
 * Converte configs antigos para o formato atual (árvore de categorias, renda fixa). Não mexe num config já atual.
 * Roda ao ler o arquivo (servidor), então backups antigos e o Desfazer do copiloto continuam funcionando.
 */
export function migrarConfig(bruto: Config | ConfigTalvezAntiga): Config {
  const c = bruto as ConfigTalvezAntiga;
  const antigo = ['grupos', 'renda', 'ifood', 'freela'].some((k) => k in c) || !Array.isArray(c.rendaFixa);
  const atual = (l: LinhaTalvezAntiga) =>
    TIPOS_ATUAIS.has(l.natureza ?? '') && l.pai !== undefined && l.grupo === undefined && !('diario' in l) && !('tipo' in l) && !('dia' in l);
  if (!antigo && c.orcamento.every(atual)) return bruto as Config;
  const primeiroFormato = !Array.isArray(c.grupos) && c.orcamento.some((l) => l.grupo !== undefined);
  const pastas = Array.isArray(c.grupos) ? c.grupos : primeiroFormato ? ARVORE_INICIAL : [];
  const linhas: LinhaOrcamento[] = c.orcamento.map((l) => {
    const { grupo, diario: _diario, tipo: _tipo, dia: _dia, ...resto } = l;
    const antes = l.natureza ?? grupo;
    const natureza: Natureza = antes === 'fixo' || antes === 'pontual' ? antes : 'flexivel';
    const pai = l.pai !== undefined ? l.pai : primeiroFormato ? (PASTA_INICIAL[l.id] ?? null) : null;
    return { ...resto, natureza, pai };
  });
  // cada pasta vira categoria (se o id já é de uma categoria, ganha outro)
  const usados = new Set(linhas.map((l) => l.id));
  const novoId = new Map<string, string>();
  for (const p of pastas) {
    const id = unico(p.id, (x) => usados.has(x));
    usados.add(id);
    novoId.set(p.id, id);
  }
  const doPai = (pai: string | null) => (pai && novoId.has(pai) ? novoId.get(pai)! : pai);
  const convertidas = new Set(novoId.values());
  let orcamento: LinhaOrcamento[] = [
    ...pastas.map((p): LinhaOrcamento => ({ id: novoId.get(p.id)!, nome: p.nome, valor: 0, natureza: 'flexivel', pai: doPai(p.pai) })),
    ...linhas.map((l) => ({ ...l, pai: doPai(l.pai) })),
  ];
  const existe = new Set(orcamento.map((l) => l.id));
  orcamento = orcamento.map((l) => (l.pai && (!existe.has(l.pai) || l.pai === l.id) ? { ...l, pai: null } : l));
  // a natureza de quem era pasta segue o que tem dentro (só vale para o que for lançado direto nela)
  orcamento = orcamento.map((l) => {
    if (!convertidas.has(l.id)) return l;
    const dentro = [...descendentes({ orcamento }, l.id)].flatMap((id) => orcamento.filter((x) => x.id === id && !convertidas.has(x.id)));
    return { ...l, natureza: naturezaComum(dentro) };
  });
  const { grupos: _pastas, renda, ifood: _ifood, freela: _freela, ...resto } = c;
  const rendaFixa = Array.isArray(c.rendaFixa)
    ? c.rendaFixa
    : renda
      ? [{ id: 'salario', nome: 'Salário', valor: r2(renda.salario + renda.bonusTrimestral / 3) }]
      : [];
  return { ...resto, rendaFixa, orcamento } as Config;
}

// ---------- Árvore ----------

type ComOrcamento = Pick<Config, 'orcamento'>;

const slug = (nome: string, padrao: string) =>
  normalizar(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || padrao;

function unico(base: string, usados: (id: string) => boolean): string {
  let id = base;
  for (let n = 2; usados(id); n++) id = `${base}-${n}`;
  return id;
}

/** id legível a partir do nome ("Pet shop" → "pet-shop"), sem repetir um que já existe. */
export function idDeCategoria(nome: string, orcamento: LinhaOrcamento[]): string {
  return unico(slug(nome, 'categoria'), (id) => orcamento.some((l) => l.id === id));
}

/** Todas do mesmo tipo → ele; misturado (ou nada) → flexível. */
export function naturezaComum(ls: LinhaOrcamento[]): Natureza {
  return ls.length > 0 && ls.every((l) => l.natureza === ls[0].natureza) ? ls[0].natureza : 'flexivel';
}

/** A categoria de cima (null = nível principal; se a de cima não existe mais, conta como nível principal). */
export function paiDe(c: ComOrcamento, l: LinhaOrcamento): string | null {
  return l.pai && l.pai !== l.id && c.orcamento.some((x) => x.id === l.pai) ? l.pai : null;
}

/** As categorias direto dentro de uma (null = nível principal). */
export function filhas(c: ComOrcamento, id: string | null): LinhaOrcamento[] {
  return c.orcamento.filter((l) => paiDe(c, l) === id);
}

export function temFilhas(c: ComOrcamento, id: string): boolean {
  return c.orcamento.some((l) => l.id !== id && l.pai === id);
}

/** A categoria e tudo que está dentro dela, em qualquer profundidade. */
export function descendentes(c: ComOrcamento, id: string): Set<string> {
  const r = new Set([id]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const l of c.orcamento)
      if (l.pai && r.has(l.pai) && !r.has(l.id)) {
        r.add(l.id);
        mudou = true;
      }
  }
  return r;
}

/** Trilha do nível principal até a categoria, inclusive ("Casa › Contas da casa"). */
export function caminho(c: ComOrcamento, id: string | null): LinhaOrcamento[] {
  const r: LinhaOrcamento[] = [];
  const vistos = new Set<string>();
  for (let l = c.orcamento.find((x) => x.id === id); l && !vistos.has(l.id); l = l.pai ? c.orcamento.find((x) => x.id === l!.pai) : undefined) {
    vistos.add(l.id);
    r.unshift(l);
  }
  return r;
}

/** Plano por mês da categoria somado ao de tudo que está dentro dela. */
export function planoTotal(c: ComOrcamento, id: string): number {
  const ds = descendentes(c, id);
  return r2(c.orcamento.filter((l) => ds.has(l.id)).reduce((s, l) => s + l.valor, 0));
}

/** Soma um valor por categoria (ex.: gasto do mês) da categoria e de tudo dentro dela. */
export function somaDentro(c: ComOrcamento, id: string, porLinha: Record<string, number>): number {
  return r2([...descendentes(c, id)].reduce((s, x) => s + (porLinha[x] ?? 0), 0));
}

export interface ItemDaLista {
  id: string | null;
  nome: string;
  nivel: number;
}

/**
 * Categorias em ordem de árvore, com o nível, para os seletores. Começa com "Nível principal" (id null).
 * `fora`: essas categorias e tudo dentro delas ficam de fora (não dá para pôr uma categoria dentro dela mesma).
 */
export function listaEmArvore(c: ComOrcamento, fora: string[] = []): ItemDaLista[] {
  const tirar = new Set(fora.flatMap((id) => [...descendentes(c, id)]));
  const r: ItemDaLista[] = [{ id: null, nome: 'Nível principal', nivel: 0 }];
  const vistos = new Set<string>();
  const visitar = (pai: string | null, nivel: number) => {
    for (const l of filhas(c, pai)) {
      if (tirar.has(l.id) || vistos.has(l.id)) continue;
      vistos.add(l.id);
      r.push({ id: l.id, nome: l.nome, nivel });
      visitar(l.id, nivel + 1);
    }
  };
  visitar(null, 1);
  return r;
}

export interface LinhaVisivel {
  linha: LinhaOrcamento;
  nivel: number;
  /** tem categorias visíveis dentro (com filtro, só as que passam) */
  temFilhas: boolean;
  aberta: boolean;
  /** sem gasto no período (só quando a lista recebe valores) */
  vazia: boolean;
}

const porNome = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const QUASE_ZERO = 0.005;

/** A categoria e as de cima dela, se ela for do tipo pedido (null = todas). */
export function passaNoFiltro(c: ComOrcamento, natureza: Natureza | null | undefined): (id: string) => boolean {
  if (!natureza) return () => true;
  const ficam = new Set<string>();
  for (const l of c.orcamento) if (l.natureza === natureza) for (const x of caminho(c, l.id)) ficam.add(x.id);
  return (id) => ficam.has(id);
}

/**
 * A árvore achatada para a lista (estilo Finder), pulando o que está dentro das fechadas.
 * Com `valor`: em cada nível, do maior gasto para o menor; as sem gasto vão para o fim, em ordem alfabética.
 * Com `natureza`: só as desse tipo e as de cima delas. Com `semVazias`: sem as que não tiveram gasto (menos as de `manter`).
 * `fechadas` guarda as recolhidas (padrão: tudo aberto).
 */
export function linhasVisiveis(
  c: ComOrcamento,
  fechadas: ReadonlySet<string>,
  opcoes: { valor?: ReadonlyMap<string, number>; natureza?: Natureza | null; semVazias?: boolean; manter?: ReadonlySet<string> } = {},
): LinhaVisivel[] {
  const { valor, natureza, semVazias, manter } = opcoes;
  const passa = passaNoFiltro(c, natureza);
  const v = (id: string) => valor?.get(id) ?? 0;
  const vazia = (id: string) => !!valor && Math.abs(v(id)) < QUASE_ZERO;
  const ordem = (a: LinhaOrcamento, b: LinhaOrcamento) =>
    Number(vazia(a.id)) - Number(vazia(b.id)) || (vazia(a.id) ? 0 : v(b.id) - v(a.id)) || porNome.compare(a.nome, b.nome);
  const r: LinhaVisivel[] = [];
  const vistos = new Set<string>();
  const dentro = (id: string | null) => filhas(c, id).filter((l) => passa(l.id) && (!semVazias || !vazia(l.id) || !!manter?.has(l.id)));
  const visitar = (pai: string | null, nivel: number) => {
    for (const l of dentro(pai).sort(ordem)) {
      if (vistos.has(l.id)) continue;
      vistos.add(l.id);
      const tem = dentro(l.id).some((f) => f.id !== l.id);
      const aberta = tem && !fechadas.has(l.id);
      r.push({ linha: l, nivel, temFilhas: tem, aberta, vazia: vazia(l.id) });
      if (aberta) visitar(l.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return r;
}

/** Nome sem repetir um que já existe ("Nova categoria", "Nova categoria 2"…). */
export function nomeLivre(c: ComOrcamento, base: string): string {
  const usados = new Set(c.orcamento.map((l) => l.nome.toLocaleLowerCase('pt-BR')));
  let nome = base;
  for (let n = 2; usados.has(nome.toLocaleLowerCase('pt-BR')); n++) nome = `${base} ${n}`;
  return nome;
}

/** Cria uma categoria (sem plano) e devolve o config com ela e o id. */
export function criar(c: Config, nome: string, natureza: Natureza, pai: string | null = null): { config: Config; id: string } {
  const id = idDeCategoria(nome, c.orcamento);
  return { config: { ...c, orcamento: [...c.orcamento, { id, nome: nome.trim(), valor: 0, natureza, pai }] }, id };
}

/** Muda campos de uma categoria (nome, plano, tipo, nota). Nome vazio não muda o nome. */
export function editar(c: Config, id: string, campos: Partial<Pick<LinhaOrcamento, 'nome' | 'valor' | 'natureza' | 'nota'>>): Config {
  return {
    ...c,
    orcamento: c.orcamento.map((l) => {
      if (l.id !== id) return l;
      const nova = { ...l, ...campos, nome: campos.nome?.trim() || l.nome };
      if (campos.nota !== undefined && !campos.nota.trim()) delete nova.nota;
      return nova;
    }),
  };
}

/** Põe categorias dentro de outra (null = nível principal). Não deixa pôr uma dentro dela mesma. */
export function mover(c: Config, ids: string[], destino: string | null): Config {
  if (destino && ids.some((id) => descendentes(c, id).has(destino))) throw new Error('Não dá para pôr uma categoria dentro dela mesma.');
  const s = new Set(ids);
  return { ...c, orcamento: c.orcamento.map((l) => (s.has(l.id) ? { ...l, pai: destino } : l)) };
}

export type DadosCategorias = { config: Config; transacoes: Transacao[]; regras: Regra[] };

export interface ResultadoCategorias extends DadosCategorias {
  lancamentos: number;
  regrasMudadas: number;
}

/**
 * Junta várias categorias numa só (o destino): lançamentos e regras passam para ele, o plano por mês é somado,
 * o que estava dentro delas passa a ficar dentro dele e as de origem somem.
 */
export function mesclar(d: DadosCategorias, origens: string[], destino: string): ResultadoCategorias {
  const c = d.config;
  const fontes = new Set(origens.filter((o) => o !== destino));
  const alvo = c.orcamento.find((l) => l.id === destino);
  if (!alvo) throw new Error('Categoria de destino não existe.');
  const somar = c.orcamento.filter((l) => fontes.has(l.id)).reduce((s, l) => s + l.valor, 0);
  // se o destino estava dentro de uma das que somem, ele sobe para fora dela
  const dentroDeFonte = (id: string | null) => caminho(c, id).some((l) => fontes.has(l.id));
  let paiAlvo = paiDe(c, alvo);
  while (paiAlvo && dentroDeFonte(paiAlvo)) paiAlvo = c.orcamento.find((l) => l.id === paiAlvo)?.pai ?? null;
  const daOrigem = (linha: string | null | undefined) => !!linha && fontes.has(linha);
  return {
    config: {
      ...c,
      orcamento: c.orcamento
        .filter((l) => !fontes.has(l.id))
        .map((l) => {
          if (l.id === destino) return { ...l, valor: r2(l.valor + somar), pai: paiAlvo };
          return l.pai && fontes.has(l.pai) ? { ...l, pai: destino } : l;
        }),
    },
    transacoes: d.transacoes.map((t) => (daOrigem(t.linha) ? { ...t, linha: destino } : t)),
    regras: d.regras.map((r) => (daOrigem(r.linha) ? { ...r, linha: destino } : r)),
    lancamentos: d.transacoes.filter((t) => daOrigem(t.linha)).length,
    regrasMudadas: d.regras.filter((r) => daOrigem(r.linha)).length,
  };
}

/** Junta duas categorias: fica `fica` (com o lugar e o tipo dela), a outra entra nela; `nome` renomeia a que fica. */
export function juntar(d: DadosCategorias, outra: string, fica: string, nome?: string): ResultadoCategorias {
  const r = mesclar(d, [outra], fica);
  return nome?.trim() ? { ...r, config: editar(r.config, fica, { nome }) } : r;
}

/**
 * Exclui categorias. O que estava dentro delas sobe um nível. Os lançamentos e as regras vão para `destino`;
 * com destino null, os lançamentos ficam sem categoria (os do banco voltam para "a categorizar") e as regras somem.
 */
export function excluir(d: DadosCategorias, ids: string[], destino: string | null): ResultadoCategorias {
  const c = d.config;
  const somem = new Set(ids);
  if (destino && somem.has(destino)) throw new Error('Os lançamentos precisam ir para uma categoria que continua existindo.');
  if (destino && !c.orcamento.some((l) => l.id === destino)) throw new Error('Categoria de destino não existe.');
  const sobe = (pai: string | null) => {
    let p = pai;
    const vistos = new Set<string>();
    while (p && somem.has(p) && !vistos.has(p)) {
      vistos.add(p);
      p = c.orcamento.find((l) => l.id === p)?.pai ?? null;
    }
    return p && !somem.has(p) ? p : null;
  };
  const daqui = (linha: string | null | undefined) => !!linha && somem.has(linha);
  return {
    config: {
      ...c,
      orcamento: c.orcamento.filter((l) => !somem.has(l.id)).map((l) => (l.pai && somem.has(l.pai) ? { ...l, pai: sobe(l.pai) } : l)),
    },
    transacoes: d.transacoes.map((t) => {
      if (!daqui(t.linha)) return t;
      if (destino) return { ...t, linha: destino };
      const { editado: _editado, ...resto } = t;
      return { ...resto, linha: null };
    }),
    regras: destino ? d.regras.map((r) => (daqui(r.linha) ? { ...r, linha: destino } : r)) : d.regras.filter((r) => !daqui(r.linha)),
    lancamentos: d.transacoes.filter((t) => daqui(t.linha)).length,
    regrasMudadas: d.regras.filter((r) => daqui(r.linha)).length,
  };
}

// ---------- Regras ("lembrar da próxima vez") ----------

/** A regra que faz a próxima transação parecida cair onde você colocou esta. null = nada a lembrar. */
export function regraDoLancamento(padrao: string, t: Pick<Transacao, 'tipo' | 'linha' | 'fonte'>): Regra | null {
  const p = normalizar(padrao);
  if (!p) return null;
  if (t.tipo === 'transferencia') return { padrao: p, tipo: 'transferencia' };
  if (t.tipo === 'receita') return t.fonte ? { padrao: p, fonte: t.fonte } : null;
  return t.linha ? { padrao: p, linha: t.linha } : null;
}

/** Regra nova vai para o topo (a primeira que casa vence) e substitui outra com o mesmo padrão e a mesma faixa de valor. */
export function incluirRegra(regras: Regra[], nova: Regra): Regra[] {
  const p = normalizar(nova.padrao);
  const mesma = (r: Regra) => normalizar(r.padrao) === p && r.valorMin === nova.valorMin && r.valorMax === nova.valorMax;
  return [nova, ...regras.filter((r) => !mesma(r))];
}

/**
 * Outras transações que a regra nova muda, já com a categoria nova.
 * Não mexe no que foi lançado à mão nem no que você já editou.
 */
export function parecidas(transacoes: Transacao[], regra: Regra, config: Config, exceto?: string): Transacao[] {
  return transacoes.flatMap((t) => {
    if (t.id === exceto || !regraCasa(regra, t.descricao, t.valorBanco ?? t.valor)) return [];
    const nova = reclassificar(t, [regra], config);
    return nova === t ? [] : [nova];
  });
}
