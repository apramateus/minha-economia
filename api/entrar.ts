// POST /api/entrar → confere a senha (APP_SENHA_HASH) e deixa o cookie de sessão: senha uma vez por aparelho, vale 1 ano.
// Quem confere o cookie depois é o middleware.ts (mesmo APP_SEGREDO, mesma conta: HMAC-SHA256 de `<emitidoEm>` em hex).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANO_S = 365 * 24 * 60 * 60;
const ESPERA_MS = 1000; // trava simples contra tentativa em massa: errou, só responde ~1s depois
const LIMITE_ERROS = 10;
const JANELA_MS = 10 * 60 * 1000;

/** erros por IP, na memória desta função (some quando a Vercel troca a instância — é só uma trava simples) */
const tentativas = new Map<string, { erros: number; ate: number }>();

/** Comparação em tempo constante: o tempo da resposta não conta quanto do valor estava certo. */
function igual(a: string, b: string): boolean {
  const veio = Buffer.from(a);
  const esperado = Buffer.from(b);
  return veio.length === esperado.length && timingSafeEqual(veio, esperado);
}

function deQuem(req: VercelRequest): string {
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'sem-ip';
}

function errou(ip: string) {
  const agora = Date.now();
  const antes = tentativas.get(ip);
  tentativas.set(ip, antes && antes.ate > agora ? { erros: antes.erros + 1, ate: antes.ate } : { erros: 1, ate: agora + JANELA_MS });
  if (tentativas.size > 500) for (const [chave, r] of tentativas) if (r.ate <= agora) tentativas.delete(chave);
}

function travado(ip: string): boolean {
  const r = tentativas.get(ip);
  return !!r && r.ate > Date.now() && r.erros >= LIMITE_ERROS;
}

const espera = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));

export default async function (req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não suportado' });

  const senhaHash = process.env.APP_SENHA_HASH?.trim().toLowerCase();
  const segredo = process.env.APP_SEGREDO;
  if (!senhaHash || !segredo) return res.status(500).json({ erro: 'falta APP_SENHA_HASH ou APP_SEGREDO' });

  const ip = deQuem(req);
  if (travado(ip)) {
    await espera(ESPERA_MS);
    return res.status(429).json({ erro: 'espere um pouco' });
  }

  // a Vercel já entrega o JSON pronto; se vier como texto, é só ler
  let corpo: unknown = req.body;
  if (typeof corpo === 'string') {
    try {
      corpo = JSON.parse(corpo);
    } catch {
      return res.status(400).json({ erro: 'JSON inválido' });
    }
  }
  const senha = (corpo as { senha?: unknown } | null)?.senha;

  if (typeof senha !== 'string' || !senha || !igual(createHash('sha256').update(senha).digest('hex'), senhaHash)) {
    errou(ip);
    await espera(ESPERA_MS);
    return res.status(401).json({ erro: 'senha errada' });
  }

  tentativas.delete(ip);
  const emitidoEm = String(Date.now());
  const sessao = `${emitidoEm}.${createHmac('sha256', segredo).update(emitidoEm).digest('hex')}`;
  res.setHeader('Set-Cookie', `me_sessao=${sessao}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ANO_S}`);
  return res.status(200).json({ ok: true });
}
