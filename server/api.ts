// Plugin do Vite: a API do app em casa. As rotas de dados e de banco são as mesmas da nuvem (`rotas.ts`);
// o copiloto e o endereço da rede só existem aqui.
import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { CABECALHOS_JSON, responder } from './rotas.ts';
import { rotasCopiloto } from './copiloto.ts';
import { execFile } from 'node:child_process';
import os from 'node:os';

function nomeNaRede(): Promise<string> {
  return new Promise((resolve) => {
    execFile('scutil', ['--get', 'LocalHostName'], (erro, saida) => resolve(erro ? os.hostname().replace(/\.local$/, '') : saida.trim()));
  });
}

function ipDaRede(): string | null {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista ?? []) if (i.family === 'IPv4' && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address)) return i.address;
  }
  return null;
}

const LIMITE_BYTES = 20 * 1024 * 1024;

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes: Buffer[] = [];
    req.on('data', (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_BYTES) {
        reject(new Error('corpo grande demais'));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

export function apiDados(): Plugin {
  return {
    name: 'api-dados',
    configureServer(server) {
      // Só o próprio app manda pedidos que mudam algo: um site aberto no navegador não consegue gravar,
      // sincronizar nem falar com o copiloto por baixo dos panos.
      server.middlewares.use('/api', (req, res, next) => {
        const origem = req.headers.origin;
        if (req.method === 'GET' || req.method === 'HEAD' || !origem) return next();
        if (origem.toLowerCase() === `http://${String(req.headers.host ?? '').toLowerCase()}`) return next();
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ erro: 'pedido de outro site' }));
      });

      // Endereço para abrir no celular (mesma Wi-Fi)
      server.middlewares.use('/api/rede', async (_req, res) => {
        const porta = server.config.server.port ?? 5180;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            nome: `${await nomeNaRede()}.local`,
            ip: ipDaRede(),
            porta,
            // true quando rodou com --host (npm run celular ou o atalho da Mesa)
            exposto: !!server.config.server.host,
          }),
        );
      });

      // Copiloto (Claude Code com a assinatura do usuário)
      server.middlewares.use('/api/copiloto', rotasCopiloto());

      // Dados (/api/dados) e banco (/api/banco): o mesmo código das funções da Vercel
      server.middlewares.use('/api', async (req, res) => {
        try {
          const metodo = req.method ?? 'GET';
          const cabecalhos = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
          const r = await responder({
            metodo,
            caminho: `/api${req.url ?? '/'}`,
            cabecalhos,
            corpo: metodo === 'GET' || metodo === 'HEAD' ? undefined : await lerCorpo(req),
          });
          res.statusCode = r.status;
          for (const [k, v] of Object.entries({ ...CABECALHOS_JSON, ...r.cabecalhos })) res.setHeader(k, v);
          res.end(JSON.stringify(r.corpo));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ erro: (e as Error).message }));
        }
      });
    },
  };
}
