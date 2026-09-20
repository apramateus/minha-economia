// POST /api/banco/sincronizar → puxa o banco (Meu Pluggy) e grava no depósito. É o botão Atualizar, de qualquer lugar.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { responderNaVercel } from '../../server/rotas.ts';

export default function (req: VercelRequest, res: VercelResponse) {
  return responderNaVercel(req, res);
}
