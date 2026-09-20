// Propostas do copiloto: ele trabalha numa cópia dos dados (a `base` é como estavam quando ele começou) e o usuário aprova
// depois. Aplicar = mescla de três vias por cima do que está gravado agora (`atual`), que pode ter mudanças do próprio usuário
// feitas enquanto o copiloto respondia. Mexeram os dois no mesmo lugar = conflito (nada é aplicado).

export interface Mescla {
  valor: unknown;
  /** onde os dois mudaram a mesma coisa, ex.: "orcamento › Luz › valor" */
  conflitos: string[];
}

type Objeto = Record<string, unknown>;
const ehObjeto = (x: unknown): x is Objeto => !!x && typeof x === 'object' && !Array.isArray(x);

/** Igualdade de conteúdo (a ordem das chaves não importa; chave com undefined = sem a chave). */
export function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  }
  if (!ehObjeto(a) || !ehObjeto(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => igual(a[k], b[k]));
}

/** Texto estável (chaves em ordem) para identificar itens sem id. */
function estavel(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(estavel).join(',')}]`;
  if (ehObjeto(x)) {
    return `{${Object.keys(x)
      .filter((k) => x[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel(x[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x) ?? 'undefined';
}

/** Como o item aparece num conflito: o nome, a descrição ou o id. */
function rotuloDe(x: unknown): string {
  if (!ehObjeto(x)) return String(x);
  const r = x.nome ?? x.descricao ?? x.padrao ?? x.id;
  return typeof r === 'string' ? r : '?';
}

const junta = (caminho: string, parte: string) => (caminho ? `${caminho} › ${parte}` : parte);

export function mesclar3(base: unknown, atual: unknown, proposta: unknown, caminho = ''): Mescla {
  if (igual(atual, proposta) || igual(base, proposta)) return { valor: atual, conflitos: [] };
  if (igual(base, atual)) return { valor: proposta, conflitos: [] };
  if (ehObjeto(base) && ehObjeto(atual) && ehObjeto(proposta)) {
    const valor: Objeto = {};
    const conflitos: string[] = [];
    for (const k of new Set([...Object.keys(atual), ...Object.keys(proposta)])) {
      const m = mesclar3(base[k], atual[k], proposta[k], junta(caminho, k));
      if (m.valor !== undefined) valor[k] = m.valor;
      conflitos.push(...m.conflitos);
    }
    return { valor, conflitos };
  }
  if (Array.isArray(base) && Array.isArray(atual) && Array.isArray(proposta)) return mesclarListas(base, atual, proposta, caminho);
  // os dois mudaram o mesmo valor (ou um apagou o que o outro mudou): fica o do usuário, e avisa
  return { valor: atual, conflitos: [caminho || 'tudo'] };
}

/** Chave de cada item: o id, ou o conteúdo (repetidos ganham #2, #3…). */
function chaves(lista: unknown[]): Map<string, unknown> {
  const vistos = new Map<string, number>();
  const m = new Map<string, unknown>();
  for (const x of lista) {
    const k = ehObjeto(x) && typeof x.id === 'string' ? `id:${x.id}` : `v:${estavel(x)}`;
    const n = (vistos.get(k) ?? 0) + 1;
    vistos.set(k, n);
    m.set(n > 1 ? `${k}#${n}` : k, x);
  }
  return m;
}

/**
 * Listas: itens com id se mesclam um a um; sem id, o item é o conteúdo (mudar = tirar um e pôr outro).
 * Novos de cada lado entram; removidos saem (se o outro lado não mexeu neles). A ordem é a de quem reordenou.
 */
function mesclarListas(base: unknown[], atual: unknown[], proposta: unknown[], caminho: string): Mescla {
  const B = chaves(base);
  const A = chaves(atual);
  const P = chaves(proposta);
  const valores = new Map<string, unknown>();
  const conflitos: string[] = [];

  for (const k of new Set([...A.keys(), ...P.keys()])) {
    const b = B.get(k);
    const a = A.get(k);
    const p = P.get(k);
    const onde = junta(caminho, rotuloDe(a ?? p));
    if (A.has(k) && P.has(k)) {
      const m = B.has(k) ? mesclar3(b, a, p, onde) : igual(a, p) ? { valor: a, conflitos: [] } : { valor: a, conflitos: [onde] };
      valores.set(k, m.valor);
      conflitos.push(...m.conflitos);
    } else if (A.has(k)) {
      // a proposta tirou (ou o usuário acabou de criar)
      if (!B.has(k)) valores.set(k, a);
      else if (!igual(b, a)) {
        valores.set(k, a);
        conflitos.push(onde);
      }
    } else {
      // o usuário tirou (ou a proposta criou)
      if (!B.has(k)) valores.set(k, p);
      else if (!igual(b, p)) conflitos.push(onde);
    }
  }

  // a ordem: se o usuário não reordenou, vale a da proposta (que pode ter reordenado); os novos do outro lado entram
  // logo antes do item que vinha depois deles (no fim, se não vinha nenhum)
  const comuns = (l: string[]) => l.filter((k) => B.has(k) && A.has(k) && P.has(k));
  const usuarioReordenou = !igual(comuns([...B.keys()]), comuns([...A.keys()]));
  const [guia, outra] = usuarioReordenou ? [[...A.keys()], [...P.keys()]] : [[...P.keys()], [...A.keys()]];
  const ordem = guia.filter((k) => valores.has(k));
  outra.forEach((k, i) => {
    if (!valores.has(k) || ordem.includes(k)) return;
    const depois = outra.slice(i + 1).find((x) => ordem.includes(x));
    ordem.splice(depois ? ordem.indexOf(depois) : ordem.length, 0, k);
  });
  return { valor: ordem.map((k) => valores.get(k)), conflitos };
}

/**
 * Desfaz só o que mudou de `antes` para `depois`, mantendo o que tiver mudado no arquivo depois disso
 * (uma sincronização, o outro aparelho). Onde os dois mexeram no mesmo lugar, fica o que está lá agora.
 */
export function reverter<T>(antes: T, depois: T): (agora: T) => T {
  return (agora) => mesclar3(depois, agora, antes).valor as T;
}

/**
 * Dois caminhos trouxeram o mesmo lançamento do banco (mesmo hash, ids diferentes — ex.: a sincronização do app e a
 * que o copiloto rodou na cópia dele): fica o que já estava gravado, para o gasto não contar em dobro.
 */
export function tirarRepetidos<T extends { id: string; hash?: string }>(lista: T[], jaGravados: T[]): T[] {
  const ids = new Set(jaGravados.map((t) => t.id));
  const hashes = new Set(jaGravados.flatMap((t) => (t.hash ? [t.hash] : [])));
  return lista.filter((t) => ids.has(t.id) || !t.hash || !hashes.has(t.hash));
}

// ---------- Resumo da proposta (o que o cartão do copiloto mostra) ----------

const LISTAS: Record<string, { nome: string; feminino?: boolean }> = {
  transacoes: { nome: 'Lançamentos' },
  regras: { nome: 'Regras', feminino: true },
  desejos: { nome: 'Desejos' },
  'config.orcamento': { nome: 'Categorias', feminino: true },
  'config.rendaFixa': { nome: 'Renda fixa', feminino: true },
  'metas.metas': { nome: 'Metas', feminino: true },
  'metas.aportes': { nome: 'Aportes' },
  'patrimonio.contas': { nome: 'Contas', feminino: true },
  'patrimonio.dividas': { nome: 'Dívidas', feminino: true },
  'patrimonio.bens': { nome: 'Bens' },
};
const ARQUIVO: Record<string, string> = {
  config: 'Plano',
  transacoes: 'Lançamentos',
  metas: 'Metas',
  patrimonio: 'Patrimônio',
  regras: 'Regras',
  desejos: 'Desejos',
};

function contagem(antes: unknown[], depois: unknown[], feminino?: boolean): string {
  const A = chaves(antes);
  const D = chaves(depois);
  const novos = [...D.keys()].filter((k) => !A.has(k)).length;
  const tirados = [...A.keys()].filter((k) => !D.has(k)).length;
  const mudados = [...D.keys()].filter((k) => A.has(k) && !igual(A.get(k), D.get(k))).length;
  const o = feminino ? 'a' : 'o';
  const partes = [
    mudados && `${mudados} alterad${o}${mudados > 1 ? 's' : ''}`,
    novos && `${novos} nov${o}${novos > 1 ? 's' : ''}`,
    tirados && `${tirados} removid${o}${tirados > 1 ? 's' : ''}`,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'nova ordem';
}

/** Linhas curtas do que muda num arquivo, ex.: "Lançamentos: 3 alterados · 1 novo". */
export function resumoDaMudanca(arquivo: string, antes: unknown, depois: unknown): string[] {
  if (igual(antes, depois)) return [];
  if (Array.isArray(antes) && Array.isArray(depois)) {
    const l = LISTAS[arquivo] ?? { nome: ARQUIVO[arquivo] ?? arquivo };
    return [`${l.nome}: ${contagem(antes, depois, l.feminino)}`];
  }
  if (!ehObjeto(antes) || !ehObjeto(depois)) return [ARQUIVO[arquivo] ?? arquivo];
  const linhas: string[] = [];
  let outros = false;
  for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    if (igual(antes[k], depois[k])) continue;
    const l = LISTAS[`${arquivo}.${k}`];
    const a = antes[k];
    const d = depois[k];
    if (l && Array.isArray(a ?? []) && Array.isArray(d ?? [])) linhas.push(`${l.nome}: ${contagem((a ?? []) as unknown[], (d ?? []) as unknown[], l.feminino)}`);
    else outros = true;
  }
  if (outros) linhas.push(`${ARQUIVO[arquivo] ?? arquivo}: outros ajustes`);
  return linhas;
}
