// As rotas que valem nos dois lugares: em casa (plugin do Vite, `api.ts`) e na nuvem (funções da Vercel, `api/`).
// Função pura de pedido → resposta; quem responde de verdade só traduz para o HTTP de cada lado.
// O copiloto e a rede (`/api/copiloto`, `/api/rede`) são só de casa e ficam no `api.ts`.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { gravarSeForA, ler, lerComVersao, lerTudoComVersoes, nomeValido } from './armazenamento.ts';

export interface Pedido {
  metodo: string;
  /** caminho completo, com /api na frente (ex.: /api/dados/config) */
  caminho: string;
  /** nomes em minúsculas (If-Match vira if-match) */
  cabecalhos: Record<string, string | undefined>;
  corpo?: string;
}

export interface Resposta {
  status: number;
  corpo: unknown;
  cabecalhos?: Record<string, string>;
}

export const CABECALHOS_JSON: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  // nada de cache: os dados mudam a cada gravação
  'Cache-Control': 'no-store',
};

/** Em casa o copiloto existe; na nuvem, não (ele roda o Claude Code do Mac, com a assinatura do usuário). */
const naNuvem = () => !!process.env.VERCEL;

export async function responder({ metodo, caminho, cabecalhos, corpo }: Pedido): Promise<Resposta> {
  const partes = caminho.split('?')[0].split('/').filter(Boolean);
  if (partes[0] !== 'api') return { status: 404, corpo: { erro: 'rota desconhecida' } };
  const [, secao, resto] = partes;

  try {
    if (secao === 'ambiente' && metodo === 'GET') return { status: 200, corpo: { nuvem: naNuvem(), copiloto: !naNuvem() } };

    if (secao === 'dados') {
      if (metodo === 'GET' && !resto) return { status: 200, corpo: await lerTudoComVersoes() };
      if (!resto || !nomeValido(resto)) return { status: 404, corpo: { erro: 'arquivo desconhecido' } };
      if (metodo === 'GET') return { status: 200, corpo: await lerComVersao(resto) };
      if (metodo === 'PUT') {
        const dados = JSON.parse(corpo ?? '');
        if (dados === null || typeof dados !== 'object') return { status: 400, corpo: { erro: 'JSON inválido' } };
        // a versão que quem está gravando leu: se o arquivo mudou (outro aparelho, a sincronização, o copiloto),
        // nada é gravado e o app refaz a mudança por cima do que voltar aqui
        const versao = String(cabecalhos['if-match'] ?? '');
        if (!versao) return { status: 428, corpo: { erro: 'falta a versão do arquivo (recarregue o app)' } };
        const r = await gravarSeForA(resto, dados, versao);
        if (!r.ok) return { status: 409, corpo: { erro: 'o arquivo mudou', dados: r.atual, versao: r.versao } };
        return { status: 200, corpo: { ok: true, versao: r.versao } };
      }
      return { status: 405, corpo: { erro: 'método não suportado' } };
    }

    if (secao === 'banco') {
      // o pluggy-sdk só entra em cena quando alguém pede o banco
      const { lerCredenciais, sincronizar } = await import('./pluggy.ts');
      if (metodo === 'GET' && !resto) {
        const { faltando } = await lerCredenciais();
        const patrimonio = await ler('patrimonio');
        return { status: 200, corpo: { configurado: faltando.length === 0, faltando, sincronizadoEm: patrimonio.sincronizadoEm ?? null } };
      }
      if (metodo === 'POST' && resto === 'sincronizar') return { status: 200, corpo: await sincronizar() };
      return { status: 404, corpo: { erro: 'rota desconhecida' } };
    }

    return { status: 404, corpo: { erro: 'rota desconhecida' } };
  } catch (e) {
    return { status: 500, corpo: { erro: (e as Error).message } };
  }
}

/** Ponte para as funções da Vercel (pasta `api/`): o pedido delas entra aqui e sai em JSON. */
export async function responderNaVercel(req: VercelRequest, res: VercelResponse): Promise<void> {
  const metodo = req.method ?? 'GET';
  // o runtime da Vercel já entrega o corpo em JSON convertido; o `responder` quer o texto
  const corpo = req.body === undefined || metodo === 'GET' ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const r = await responder({
    metodo,
    caminho: req.url ?? '/',
    cabecalhos: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
    corpo,
  });
  for (const [k, v] of Object.entries({ ...CABECALHOS_JSON, ...r.cabecalhos })) res.setHeader(k, v);
  res.status(r.status).json(r.corpo);
}
