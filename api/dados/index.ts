// GET /api/dados → todos os arquivos com as suas versões.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { responderNaVercel } from '../../server/rotas.ts';

export default function (req: VercelRequest, res: VercelResponse) {
  return responderNaVercel(req, res);
}
