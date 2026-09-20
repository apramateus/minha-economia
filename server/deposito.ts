// Onde os dados moram. Duas opções com a mesma cara: `depositoArquivo` (data/*.json, no Mac) e `depositoBlob`
// (Vercel Blob, store privada — casa e rua veem a mesma coisa). Quem entende de JSON, versão e seed é o
// `armazenamento.ts`; aqui é só texto entrando e saindo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** O .env.local não chega ao servidor pelo Vite (só as VITE_*), então lemos o arquivo uma vez. Na nuvem ele não existe. */
const envLocal: Record<string, string> = (() => {
  const r: Record<string, string> = {};
  try {
    for (const linha of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) r[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // sem .env.local: na nuvem tudo vem do ambiente
  }
  return r;
})();

/** Variável de ambiente; no Mac, cai no .env.local. */
export function variavel(nome: string): string | undefined {
  const v = process.env[nome];
  return v ? v : envLocal[nome];
}

/** Onde ficam os dados em arquivo. O copiloto roda com MINHA_ECONOMIA_DADOS = a cópia de trabalho dele: os scripts que ele roda gravam lá. */
export const PASTA_DADOS = process.env.MINHA_ECONOMIA_DADOS ? path.resolve(process.env.MINHA_ECONOMIA_DADOS) : path.join(RAIZ, 'data');

export interface Guardado {
  texto: string;
  /** muda a cada gravação; é com ela que o depósito garante que ninguém grava por cima de ninguém */
  etag: string;
}

export type Gravacao = { ok: true; etag: string } | { ok: false; atual: Guardado | null };

export interface Deposito {
  ler(nome: string): Promise<Guardado | null>;
  /**
   * `etagEsperada`: texto = só grava se ainda estiver nessa etag; `null` = só se ainda não existir;
   * ausente = grava por cima. Quando a condição não bate, nada é gravado e volta o que está lá agora.
   */
  gravar(nome: string, texto: string, etagEsperada?: string | null): Promise<Gravacao>;
}

export const etagDoTexto = (texto: string) => crypto.createHash('sha1').update(texto).digest('hex').slice(0, 16);

export function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Caminho do backup do dia (a primeira versão de cada arquivo no dia, como sempre foi). */
export const caminhoDoBackup = (nome: string, dia = hojeLocal()) => `backups/${dia}/${nome}.json`;

const arquivoDe = (nome: string) => path.join(PASTA_DADOS, `${nome}.json`);

async function backupDoDia(nome: string) {
  const backup = path.join(PASTA_DADOS, caminhoDoBackup(nome));
  try {
    await fsp.access(backup);
    return; // o do dia já está guardado
  } catch {
    // ainda não
  }
  try {
    await fsp.mkdir(path.dirname(backup), { recursive: true });
    await fsp.copyFile(arquivoDe(nome), backup);
  } catch {
    // arquivo ainda não existia — nada para guardar
  }
}

export const depositoArquivo: Deposito = {
  async ler(nome) {
    try {
      const texto = await fsp.readFile(arquivoDe(nome), 'utf8');
      return { texto, etag: etagDoTexto(texto) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  },

  async gravar(nome, texto, etagEsperada) {
    const arq = arquivoDe(nome);
    if (etagEsperada !== undefined) {
      const atual = await depositoArquivo.ler(nome);
      const pode = etagEsperada === null ? atual === null : atual?.etag === etagEsperada;
      if (!pode) return { ok: false, atual };
    }
    await fsp.mkdir(PASTA_DADOS, { recursive: true });
    await backupDoDia(nome);
    // nome único: duas gravações ao mesmo tempo (Mac e iPhone, app e sincronização) não podem usar o mesmo arquivo
    const tmp = `${arq}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
    await fsp.writeFile(tmp, texto, 'utf8');
    await fsp.rename(tmp, arq);
    return { ok: true, etag: etagDoTexto(texto) };
  },
};

let escolhido: Promise<Deposito> | null = null;

/**
 * MINHA_ECONOMIA_DADOS (a cópia de trabalho do copiloto) → sempre arquivo; senão MINHA_ECONOMIA_DEPOSITO = 'blob'
 * → Vercel Blob; senão arquivo, como sempre. Rodando na Vercel o blob é o padrão: lá não existe disco para gravar.
 */
export function deposito(): Promise<Deposito> {
  return (escolhido ??= (async () => {
    if (process.env.MINHA_ECONOMIA_DADOS) return depositoArquivo;
    const escolha = variavel('MINHA_ECONOMIA_DEPOSITO') ?? (process.env.VERCEL ? 'blob' : 'arquivo');
    if (escolha === 'blob') return (await import('./depositoBlob.ts')).depositoBlob;
    return depositoArquivo;
  })());
}

/** Só para o script de migração: o depósito da nuvem, mesmo rodando no Mac. */
export async function depositoDaNuvem(): Promise<Deposito> {
  return (await import('./depositoBlob.ts')).depositoBlob;
}
