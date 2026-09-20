// Leitura e gravação dos dados. Usado pelo servidor do Vite, pelas funções da Vercel e pelos scripts de terminal.
// Onde os dados moram (data/*.json ou a Vercel Blob) é assunto do `deposito.ts`: aqui ficam o seed, a migração
// de formato e a versão que o app usa para não gravar por cima de ninguém.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ARQUIVOS, type Dados, type NomeArquivo } from '../src/lib/tipos.ts';
import { migrarConfig } from '../src/lib/categorias.ts';
import { lancamentosDeExemplo } from '../src/lib/exemplo.ts';
import { deposito, PASTA_DADOS, RAIZ } from './deposito.ts';

export { PASTA_DADOS, RAIZ };

const PASTA_SEED = path.join(RAIZ, 'seed');

export function nomeValido(nome: string): nome is NomeArquivo {
  return (ARQUIVOS as string[]).includes(nome);
}

/** Formato antigo → atual ao ler (cobre backups antigos e o Desfazer do copiloto). */
function migrar<N extends NomeArquivo>(nome: N, dados: Dados[N]): Dados[N] {
  return (nome === 'config' ? migrarConfig(dados as Dados['config']) : dados) as Dados[N];
}

/** Versão de um arquivo: muda sempre que o conteúdo muda. O app manda a que leu ao gravar (ver `gravarSeForA`). */
const versaoDe = (texto: string) => crypto.createHash('sha1').update(texto).digest('hex').slice(0, 16);

const comoTexto = (dados: unknown) => JSON.stringify(dados, null, 2) + '\n';

/** Instalação nova: os números de exemplo (os lançamentos são gerados até hoje). */
async function textoInicial(nome: NomeArquivo): Promise<string> {
  if (nome === 'transacoes') return comoTexto(lancamentosDeExemplo());
  return fs.readFile(path.join(PASTA_SEED, `${nome}.json`), 'utf8');
}

/** O mesmo que `lerComVersao`, mais a etag do depósito (que é o que o `gravarSeForA` confere na hora de gravar). */
async function lerDoDeposito<N extends NomeArquivo>(nome: N): Promise<{ dados: Dados[N]; versao: string; etag: string }> {
  const dep = await deposito();
  let guardado = await dep.ler(nome);
  if (!guardado) {
    const texto = await textoInicial(nome);
    // só se ainda não existir: dois pedidos ao mesmo tempo numa instalação nova não criam exemplos diferentes
    const r = await dep.gravar(nome, texto, null);
    guardado = r.ok ? { texto, etag: r.etag } : (r.atual ?? { texto, etag: '' });
  }
  const bruto: Dados[N] = JSON.parse(guardado.texto);
  const atual = migrar(nome, bruto);
  if (atual !== bruto) {
    // estava num formato antigo: já grava convertido (o copiloto e quem lê o arquivo direto veem o formato atual)
    const texto = comoTexto(atual);
    const r = await dep.gravar(nome, texto);
    return { dados: atual, versao: versaoDe(texto), etag: r.ok ? r.etag : '' };
  }
  return { dados: atual, versao: versaoDe(guardado.texto), etag: guardado.etag };
}

export async function lerComVersao<N extends NomeArquivo>(nome: N): Promise<{ dados: Dados[N]; versao: string }> {
  const { dados, versao } = await lerDoDeposito(nome);
  return { dados, versao };
}

export async function ler<N extends NomeArquivo>(nome: N): Promise<Dados[N]> {
  return (await lerComVersao(nome)).dados;
}

export async function lerTudo(): Promise<Dados> {
  const valores = await Promise.all(ARQUIVOS.map((n) => ler(n)));
  return Object.fromEntries(ARQUIVOS.map((n, i) => [n, valores[i]])) as unknown as Dados;
}

export async function lerTudoComVersoes(): Promise<{ dados: Dados; versoes: Record<NomeArquivo, string> }> {
  const lidos = await Promise.all(ARQUIVOS.map((n) => lerComVersao(n)));
  return {
    dados: Object.fromEntries(ARQUIVOS.map((n, i) => [n, lidos[i].dados])) as unknown as Dados,
    versoes: Object.fromEntries(ARQUIVOS.map((n, i) => [n, lidos[i].versao])) as Record<NomeArquivo, string>,
  };
}

/** O texto de cada arquivo como está agora, sem criar nada (o copiloto compara e mescla texto). */
export async function lerTextos(): Promise<Record<NomeArquivo, string>> {
  const dep = await deposito();
  const lidos = await Promise.all(ARQUIVOS.map((n) => dep.ler(n)));
  return Object.fromEntries(ARQUIVOS.map((n, i) => [n, lidos[i]?.texto ?? ''])) as Record<NomeArquivo, string>;
}

/**
 * Um de cada vez: ler-e-gravar sem ninguém gravar no meio (o app, a sincronização e o copiloto rodam no mesmo servidor).
 * Nunca chame de dentro de outra `emOrdem` — a segunda ficaria esperando a primeira terminar.
 * Na nuvem cada pedido pode cair numa máquina diferente: lá quem segura é a etag do depósito (`gravarSeForA`).
 */
let fila: Promise<unknown> = Promise.resolve();
export function emOrdem<T>(fn: () => Promise<T>): Promise<T> {
  const r = fila.then(fn, fn);
  fila = r.catch(() => undefined);
  return r;
}

/** Grava só se o arquivo ainda estiver na versão que quem mudou tinha lido; senão devolve o que está lá agora. */
export async function gravarSeForA<N extends NomeArquivo>(
  nome: N,
  dados: Dados[N],
  versao: string,
): Promise<{ ok: true; versao: string } | { ok: false; atual: Dados[N]; versao: string }> {
  return emOrdem(async () => {
    const agora = await lerDoDeposito(nome);
    if (agora.versao !== versao) return { ok: false as const, atual: agora.dados, versao: agora.versao };
    const texto = comoTexto(dados);
    const r = await (await deposito()).gravar(nome, texto, agora.etag);
    if (r.ok) return { ok: true as const, versao: versaoDe(texto) };
    // mudou entre a leitura e a gravação (outra máquina, na nuvem)
    const atual = r.atual ? migrar(nome, JSON.parse(r.atual.texto) as Dados[N]) : agora.dados;
    return { ok: false as const, atual, versao: r.atual ? versaoDe(r.atual.texto) : agora.versao };
  });
}

/** Grava por cima, guarda a primeira versão de cada dia em backups/AAAA-MM-DD/ e devolve a versão nova. */
export async function gravar<N extends NomeArquivo>(nome: N, dados: Dados[N]): Promise<string> {
  const texto = comoTexto(dados);
  await (await deposito()).gravar(nome, texto);
  return versaoDe(texto);
}
