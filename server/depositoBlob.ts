// Depósito na Vercel Blob (store PRIVADA: só as funções leem, com o BLOB_READ_WRITE_TOKEN).
// A etag é do próprio blob: gravar com `ifMatch` é o que impede o Mac e o celular de gravarem um por cima do outro
// quando cada pedido roda numa máquina diferente (na nuvem não existe uma fila só, como o `emOrdem` em casa).
import { BlobPreconditionFailedError, copy, get, head, put } from '@vercel/blob';
import { caminhoDoBackup, hojeLocal, variavel, type Deposito, type Guardado } from './deposito.ts';

const caminho = (nome: string) => `${nome}.json`;

const comum = () => ({ access: 'private' as const, token: variavel('BLOB_READ_WRITE_TOKEN') });

async function texto(fluxo: ReadableStream<Uint8Array>): Promise<string> {
  const partes: Uint8Array[] = [];
  for await (const p of fluxo as unknown as AsyncIterable<Uint8Array>) partes.push(p);
  return Buffer.concat(partes).toString('utf8');
}

/** "já existe" quando gravamos com allowOverwrite: false (o seed de quem acabou de instalar). */
const jaExiste = (e: unknown) => e instanceof Error && /already exists/i.test(e.message);

/** O backup do dia já foi feito nesta instância? (evita um `head` por gravação) */
const backupsDoDia = new Set<string>();

async function backupDoDia(nome: string) {
  const dia = hojeLocal();
  const destino = caminhoDoBackup(nome, dia);
  if (backupsDoDia.has(destino)) return;
  try {
    await head(destino, comum());
    backupsDoDia.add(destino);
    return; // o do dia já está guardado
  } catch {
    // ainda não
  }
  try {
    await copy(caminho(nome), destino, { ...comum(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    backupsDoDia.add(destino);
  } catch {
    // ainda não existia lá nada para guardar
  }
}

async function lerBlob(nome: string): Promise<Guardado | null> {
  // useCache: false = lê do armazenamento, não do CDN; sem isso o app poderia ver dados de um minuto atrás
  const r = await get(caminho(nome), { ...comum(), useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return { texto: await texto(r.stream), etag: r.blob.etag };
}

export const depositoBlob: Deposito = {
  ler: lerBlob,

  async gravar(nome, conteudo, etagEsperada) {
    await backupDoDia(nome);
    try {
      const r = await put(caminho(nome), conteudo, {
        ...comum(),
        addRandomSuffix: false,
        contentType: 'application/json',
        // sem allowOverwrite a Vercel recusa gravar por cima; `null` é justamente o caso de só criar
        allowOverwrite: etagEsperada !== null,
        ...(typeof etagEsperada === 'string' ? { ifMatch: etagEsperada } : {}),
      });
      return { ok: true, etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError || jaExiste(e)) return { ok: false, atual: await lerBlob(nome) };
      throw e;
    }
  },
};
