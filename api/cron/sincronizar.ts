// Sincronização de todo dia (a Pluggy atualiza o Meu Pluggy 1×/dia). Quem chama é o cron da Vercel,
// com Authorization: Bearer $CRON_SECRET — esta rota fica fora da tranca do login, então ela se defende sozinha.
import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CABECALHOS_JSON } from '../../server/rotas.ts';

function ehOSegredo(cabecalho: string | undefined, segredo: string): boolean {
  const veio = Buffer.from(cabecalho ?? '');
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return veio.length === esperado.length && crypto.timingSafeEqual(veio, esperado);
}

export default async function (req: VercelRequest, res: VercelResponse) {
  for (const [k, v] of Object.entries(CABECALHOS_JSON)) res.setHeader(k, v);
  const segredo = process.env.CRON_SECRET ?? '';
  if (!segredo || !ehOSegredo(req.headers.authorization, segredo)) return res.status(401).json({ erro: 'não autorizado' });
  try {
    const { sincronizar } = await import('../../server/pluggy.ts');
    const r = await sincronizar();
    return res.status(200).json({ ok: true, novas: r.novas, avisos: r.avisos });
  } catch (e) {
    return res.status(500).json({ erro: (e as Error).message });
  }
}
