// GET /api/ambiente → onde o app está rodando. Só existe na nuvem: em casa esta rota não responde e o app entende
// que está em casa (src/lib/ambiente.ts). O copiloto roda o Claude Code do Mac, então na nuvem ele não aparece.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function (_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ nuvem: true, copiloto: false });
}
