// Tranca da nuvem (Edge Middleware da Vercel): sem o cookie de sessão, pedido de página vai para /entrar e /api/* devolve 401.
// Em casa (Vite) este arquivo não roda: o app continua abrindo direto, sem login.
// O cookie `me_sessao` é `<emitidoEm>.<hmac>`; quem emite é o api/entrar.ts, com a mesma conta e o mesmo APP_SEGREDO.

/** O que abre sem cookie. Vale no `matcher` (a Vercel nem chama o middleware) e aqui dentro, por garantia. */
const ABERTO = [/^\/entrar/, /^\/api\/entrar$/, /^\/api\/cron\//, /^\/assets\//, /^\/favicon/, /^\/icon/, /^\/apple-touch-icon/, /^\/manifest\.webmanifest$/];

export const config = {
  matcher: ['/((?!entrar|api/entrar|api/cron/|assets/|favicon|icon|apple-touch-icon|manifest\\.webmanifest).*)'],
};

const ANO_MS = 365 * 24 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const bytes = new TextEncoder();

/** HMAC-SHA256 em hex (Web Crypto, runtime edge). Mesma conta do api/entrar.ts: mudou aqui, muda lá. */
async function assinar(mensagem: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', bytes.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, bytes.encode(mensagem)));
  return Array.from(assinatura, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparação em tempo constante: o tempo da resposta não conta quanto do valor estava certo. */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function lerCookie(cabecalho: string | null, nome: string): string | null {
  for (const parte of (cabecalho ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return resto.join('=');
  }
  return null;
}

async function sessaoValida(valor: string | null, segredo: string): Promise<boolean> {
  const [emitidoEm, hmac] = (valor ?? '').split('.');
  const quando = Number(emitidoEm);
  // vale 1 ano; data no futuro (relógio adiantado mais de um dia) também não vale
  if (!hmac || !Number.isFinite(quando) || Date.now() - quando > ANO_MS || quando - Date.now() > DIA_MS) return false;
  return igual(hmac, await assinar(emitidoEm, segredo));
}

export default async function middleware(req: Request): Promise<Response | undefined> {
  const url = new URL(req.url);
  const caminho = url.pathname;
  // sem resposta = o pedido segue para o destino
  if (ABERTO.some((r) => r.test(caminho))) return;

  const segredo = process.env.APP_SEGREDO;
  // sem o segredo a tranca não fecha: melhor não abrir nada
  if (!segredo) return new Response('Falta APP_SEGREDO', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  if (await sessaoValida(lerCookie(req.headers.get('cookie'), 'me_sessao'), segredo)) return;

  if (caminho.startsWith('/api/'))
    return new Response(JSON.stringify({ erro: 'entre de novo' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });

  const destino = new URL('/entrar', url);
  destino.searchParams.set('de', caminho + url.search);
  return new Response(null, { status: 302, headers: { Location: destino.toString(), 'Cache-Control': 'no-store' } });
}
