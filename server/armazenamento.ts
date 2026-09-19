// Leitura e gravação dos arquivos em data/. Usado pelo servidor do Vite e pelos scripts de terminal.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVOS, type Dados, type NomeArquivo } from '../src/lib/tipos.ts';
import { migrarConfig } from '../src/lib/categorias.ts';
import { lancamentosDeExemplo } from '../src/lib/exemplo.ts';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Onde ficam os dados. O copiloto roda com MINHA_ECONOMIA_DADOS = a cópia de trabalho dele: os scripts que ele roda gravam lá. */
export const PASTA_DADOS = process.env.MINHA_ECONOMIA_DADOS ? path.resolve(process.env.MINHA_ECONOMIA_DADOS) : path.join(RAIZ, 'data');
const PASTA_SEED = path.join(RAIZ, 'seed');
const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups');

export function nomeValido(nome: string): nome is NomeArquivo {
  return (ARQUIVOS as string[]).includes(nome);
}

function caminho(nome: NomeArquivo) {
  return path.join(PASTA_DADOS, `${nome}.json`);
}

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Formato antigo → atual ao ler (cobre backups antigos e o Desfazer do copiloto). */
function migrar<N extends NomeArquivo>(nome: N, dados: Dados[N]): Dados[N] {
  return (nome === 'config' ? migrarConfig(dados as Dados['config']) : dados) as Dados[N];
}

/**
 * Lê data/<nome>.json; se ainda não existir, copia do seed/ (os lançamentos de exemplo são gerados até hoje: `lancamentosDeExemplo`). Se estava num formato antigo, já grava convertido
 * (assim o copiloto e quem lê o arquivo direto veem o formato atual).
 */
export async function ler<N extends NomeArquivo>(nome: N): Promise<Dados[N]> {
  const arq = caminho(nome);
  let bruto: Dados[N];
  try {
    bruto = JSON.parse(await fs.readFile(arq, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    await fs.mkdir(PASTA_DADOS, { recursive: true });
    if (nome === 'transacoes') await fs.writeFile(arq, JSON.stringify(lancamentosDeExemplo(), null, 2) + '\n', 'utf8');
    else await fs.copyFile(path.join(PASTA_SEED, `${nome}.json`), arq);
    bruto = JSON.parse(await fs.readFile(arq, 'utf8'));
  }
  const atual = migrar(nome, bruto);
  if (atual !== bruto) await gravar(nome, atual);
  return atual;
}

export async function lerTudo(): Promise<Dados> {
  const valores = await Promise.all(ARQUIVOS.map((n) => ler(n)));
  return Object.fromEntries(ARQUIVOS.map((n, i) => [n, valores[i]])) as unknown as Dados;
}

/** Grava de forma atômica e guarda a primeira versão de cada dia em data/backups/AAAA-MM-DD/. */
export async function gravar<N extends NomeArquivo>(nome: N, dados: Dados[N]) {
  const arq = caminho(nome);
  await fs.mkdir(PASTA_DADOS, { recursive: true });

  const pastaDia = path.join(PASTA_BACKUPS, hojeLocal());
  const backup = path.join(pastaDia, `${nome}.json`);
  try {
    await fs.access(backup);
  } catch {
    try {
      await fs.mkdir(pastaDia, { recursive: true });
      await fs.copyFile(arq, backup);
    } catch {
      // arquivo ainda não existia — nada para guardar
    }
  }

  const tmp = `${arq}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(dados, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, arq);
}
