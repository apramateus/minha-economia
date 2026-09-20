// GET /api/banco → o banco está configurado? quando foi a última sincronização?
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { responderNaVercel } from '../../server/rotas.ts';

export default function (req: VercelRequest, res: VercelResponse) {
  return responderNaVercel(req, res);
}
