// Plugin do Vite: expõe data/*.json em /api/dados/<nome> (GET lê, PUT grava).
import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { gravar, ler, lerTudo, nomeValido } from './armazenamento.ts';
import { lerCredenciais, sincronizar } from './pluggy.ts';
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

      // Banco (Meu Pluggy): status e sincronização. As credenciais ficam só aqui no servidor.
      server.middlewares.use('/api/banco', async (req, res) => {
        const responder = (status: number, corpo: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(corpo));
        };
        const rota = (req.url ?? '/').split('?')[0].replace(/\/+$/, '');
        try {
          if (req.method === 'GET' && rota === '') {
            const { faltando } = await lerCredenciais();
            const patrimonio = await ler('patrimonio');
            return responder(200, { configurado: faltando.length === 0, faltando, sincronizadoEm: patrimonio.sincronizadoEm ?? null });
          }
          if (req.method === 'POST' && rota === '/sincronizar') return responder(200, await sincronizar());
          return responder(404, { erro: 'rota desconhecida' });
        } catch (e) {
          responder(500, { erro: (e as Error).message });
        }
      });

      server.middlewares.use('/api/dados', async (req, res) => {
        const responder = (status: number, corpo: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(corpo));
        };
        try {
          const nome = (req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, '');

          if (req.method === 'GET' && nome === '') return responder(200, await lerTudo());
          if (!nomeValido(nome)) return responder(404, { erro: 'arquivo desconhecido' });
          if (req.method === 'GET') return responder(200, await ler(nome));
          if (req.method === 'PUT') {
            const dados = JSON.parse(await lerCorpo(req));
            if (dados === null || typeof dados !== 'object') return responder(400, { erro: 'JSON inválido' });
            await gravar(nome, dados);
            return responder(200, { ok: true });
          }
          return responder(405, { erro: 'método não suportado' });
        } catch (e) {
          responder(500, { erro: (e as Error).message });
        }
      });
    },
  };
}
