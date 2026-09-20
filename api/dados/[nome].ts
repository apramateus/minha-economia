// GET /api/dados/<nome> lê um arquivo; PUT grava com If-Match (200 grava, 409 mudou, 428 sem versão).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { responderNaVercel } from '../../server/rotas.ts';

export default function (req: VercelRequest, res: VercelResponse) {
  return responderNaVercel(req, res);
}
