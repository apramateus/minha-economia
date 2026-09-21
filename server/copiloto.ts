// Copiloto: chama o Claude Code em modo headless (usa a assinatura do usuário, sem chave de API)
// dentro da pasta do projeto. Permissões: ler só a pasta do app (menos .env*), alterar SÓ a cópia de trabalho dos dados,
// rodar só os scripts do app.
// Ele nunca mexe em data/ direto: trabalha numa cópia, e o que mudar vira uma PROPOSTA que o usuário aprova (OK) ou
// descarta. Aplicar mescla com o que o usuário mudou enquanto isso (src/lib/mescla.ts) e tira uma foto para o "Desfazer".
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ARQUIVOS, type Dados, type NomeArquivo, type Transacao } from '../src/lib/tipos.ts';
import { igual, mesclar3, resumoDaMudanca, tirarRepetidos } from '../src/lib/mescla.ts';
import { emOrdem, gravar, lerTextos, PASTA_DADOS, RAIZ } from './armazenamento.ts';

const PASTA_FOTOS = path.join(PASTA_DADOS, 'backups', 'copiloto');
const MAX_FOTOS = 30;
/** cada proposta: <id>/ = a cópia de trabalho do copiloto; <id>-base/ = como os dados estavam quando ele começou */
const PASTA_PROPOSTAS = path.join(PASTA_DADOS, 'backups', 'propostas');
const MAX_PROPOSTAS = 20;
const TEMPO_MAXIMO_MS = 6 * 60_000;
/** o plano financeiro que o CLAUDE.local.md cita mora aqui, fora da pasta do app */
const PASTA_PLANOS = path.join(os.homedir(), '.claude', 'plans');

const FERRAMENTAS_PERMITIDAS = [
  'Read',
  'Glob',
  'Grep',
  'Bash(npm run resumo)',
  'Bash(npm run resumo *)',
  'Bash(npm run recategorizar)',
  'Bash(npm run recategorizar *)',
  'Bash(npm run sincronizar)',
  'Bash(npm run sincronizar *)',
  'Bash(npm run importar *)',
  'WebSearch',
  'WebFetch',
];
const FERRAMENTAS_PROIBIDAS = ['Read(.env*)', 'Read(**/.env*)'];

const instrucoes = (dados: string) => `Você é o copiloto do app "Minha Economia", conversando pelo painel de chat dentro do app (muitas vezes no celular).
- Responda em português do Brasil, curto e direto. Markdown simples: parágrafos curtos, listas, **negrito**. Evite tabelas largas.
- Valores sempre em R$. Seja honesto e sem julgamento sobre os gastos.
- Siga o CLAUDE.md do projeto (formato dos dados, regras de negócio). Para números do mês use \`npm run resumo -- AAAA-MM\`.
- Os dados (config, regras, transacoes, metas, patrimonio, desejos) estão numa CÓPIA DE TRABALHO: \`${dados}/<nome>.json\`.
  Leia e altere SÓ essas cópias (data/*.json você não pode alterar); mantenha JSON válido e o formato existente. Os comandos npm
  já usam a cópia. Depois de criar ou mudar regras, rode \`npm run recategorizar\`. Não altere código nem outros arquivos.
- Comandos permitidos: npm run resumo | recategorizar | sincronizar | importar. Outros comandos serão negados — não tente.
- Categorias: config.orcamento é uma árvore — qualquer categoria pode ficar dentro de outra (\`pai\` = id da de cima, null = nível principal).
  \`valor\` = plano próprio (a de cima mostra a soma com as de dentro); \`natureza\` = tipo: fixo | flexivel | pontual (pontual: valor = média mensal).
  Pôr dentro = mudar \`pai\` (nunca criar ciclo). Juntar/excluir mexe também em transacoes (\`linha\`) e regras: não deixe apontando para id que sumiu.
  "A categorizar" = gasto importado sem categoria e sem \`editado\`; ao categorizar para o usuário, ponha \`linha\` e \`editado: true\`.
- Pedidos claros e pequenos: faça. Mudanças grandes, ambíguas ou que apagam dados: explique e pergunte antes.
- Nada do que você alterar vale antes de o usuário aprovar: vira uma proposta com OK/Descartar embaixo da sua resposta.
  Quando alterar algo, termine com uma linha "Proposta:" listando o que muda. Se o contexto disser que a proposta anterior foi
  descartada (ou ainda está pendente), ela NÃO foi aplicada.`;

function carimbo() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Sem pasta = os dados de verdade (que na nuvem não estão em arquivo); com pasta = a cópia de trabalho da proposta. */
async function lerDados(pasta?: string): Promise<Record<string, string>> {
  if (!pasta) return lerTextos();
  const r: Record<string, string> = {};
  for (const n of ARQUIVOS) {
    try {
      r[n] = await fs.readFile(path.join(pasta, `${n}.json`), 'utf8');
    } catch {
      r[n] = '';
    }
  }
  return r;
}

async function gravarPasta(pasta: string, conteudo: Record<string, string>) {
  await fs.mkdir(pasta, { recursive: true });
  for (const [n, c] of Object.entries(conteudo)) if (c) await fs.writeFile(path.join(pasta, `${n}.json`), c, 'utf8');
}

const lerJson = (texto: string): unknown => (texto ? JSON.parse(texto) : undefined);
/** mesmo conteúdo (o copiloto pode ter regravado o arquivo só com outra formatação) */
function mesmoConteudo(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return igual(lerJson(a), lerJson(b));
  } catch {
    return false;
  }
}

const pastaDaProposta = (id: string) => ({ trabalho: path.join(PASTA_PROPOSTAS, id), base: path.join(PASTA_PROPOSTAS, `${id}-base`) });

async function apagarProposta(id: string) {
  const { trabalho, base } = pastaDaProposta(id);
  await fs.rm(trabalho, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(base, { recursive: true, force: true }).catch(() => undefined);
}

/** guarda só as últimas MAX_PROPOSTAS (as mais velhas nunca respondidas somem) */
async function podarPropostas() {
  const ids = (await fs.readdir(PASTA_PROPOSTAS).catch(() => [] as string[])).filter((x) => !x.endsWith('-base')).sort();
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_PROPOSTAS))) await apagarProposta(id);
}

/**
 * Foto para o Desfazer: `<n>.json` = como estava antes e `<n>.depois.json` = como ficou. Com os dois, desfazer
 * volta só o que a proposta mudou, sem levar junto o que veio depois (uma sincronização, o outro aparelho).
 */
async function tirarFoto(conteudo: Record<string, string>, depois: Record<string, string> = {}): Promise<string> {
  const id = carimbo();
  const pasta = path.join(PASTA_FOTOS, id);
  await fs.mkdir(pasta, { recursive: true });
  for (const [n, c] of Object.entries(conteudo)) if (c) await fs.writeFile(path.join(pasta, `${n}.json`), c, 'utf8');
  for (const [n, c] of Object.entries(depois)) if (c) await fs.writeFile(path.join(pasta, `${n}.depois.json`), c, 'utf8');
  const todas = (await fs.readdir(PASTA_FOTOS)).sort();
  for (const velha of todas.slice(0, Math.max(0, todas.length - MAX_FOTOS))) {
    await fs.rm(path.join(PASTA_FOTOS, velha), { recursive: true, force: true });
  }
  return id;
}

async function lerCorpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

/** Descreve em uma linha o que a ferramenta está fazendo (mostrado no chat). */
function descreverPasso(nome: string, entrada: Record<string, unknown>): string {
  // a cópia de trabalho aparece como o arquivo de verdade (data/config.json…), que é o que o usuário reconhece
  const arq = (p: unknown) =>
    typeof p === 'string' ? (path.relative(RAIZ, path.resolve(RAIZ, p)) || p).replace(/^data\/backups\/propostas\/[^/]+\//, 'data/') : '';
  switch (nome) {
    case 'Read':
      return `Lendo ${arq(entrada.file_path)}`;
    case 'Edit':
    case 'Write':
      return `Alterando ${arq(entrada.file_path)}`;
    case 'Bash':
      return `Rodando ${String(entrada.command ?? '').replace(/^cd .*?&&\s*/, '')}`;
    case 'Grep':
    case 'Glob':
      return `Procurando ${String(entrada.pattern ?? '')}`;
    case 'WebSearch':
      return `Pesquisando: ${String(entrada.query ?? '')}`;
    case 'WebFetch':
      try {
        return `Lendo ${new URL(String(entrada.url)).host}`;
      } catch {
        return 'Lendo página da web';
      }
    default:
      return nome;
  }
}

type Evento =
  | { t: 'sessao'; id: string }
  | { t: 'texto'; d: string }
  | { t: 'passo'; texto: string }
  | { t: 'negado'; ferramenta: string }
  /** `proposta`: o que o copiloto quer mudar (nada foi aplicado ainda); `alterados`/`resumo`: o que ela muda */
  | { t: 'fim'; sessao: string | null; alterados: string[]; proposta: string | null; resumo: string[]; erro?: string };

async function conversar(req: IncomingMessage, res: ServerResponse) {
  const corpo = await lerCorpo(req);
  const texto = String(corpo.texto ?? '').trim();
  const sessao = typeof corpo.sessao === 'string' && /^[\w-]+$/.test(corpo.sessao) ? corpo.sessao : null;
  const contexto = typeof corpo.contexto === 'string' ? corpo.contexto.slice(0, 500) : '';
  if (!texto) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ erro: 'mensagem vazia' }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const enviar = (e: Evento) => res.write(JSON.stringify(e) + '\n');

  // o copiloto trabalha numa cópia: data/ só muda quando o usuário aprovar a proposta
  const antes = await lerDados();
  const id = carimbo();
  const { trabalho, base } = pastaDaProposta(id);
  const relativa = path.relative(RAIZ, trabalho);
  await gravarPasta(trabalho, antes);
  await gravarPasta(base, antes);
  await podarPropostas();

  const args = [
    '-p',
    contexto ? `[Contexto do app: ${contexto}]\n\n${texto}` : texto,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode',
    'dontAsk',
    // ele só lê o que está na pasta do app (nada de ~/.ssh, nem por Grep/Glob), em qualquer situação
    '--settings',
    JSON.stringify({ permissions: { blockReadsOutsideWorkingDirectories: true } }),
    // mais a pasta dos planos, se existir: é onde mora o plano financeiro que o CLAUDE.local.md cita
    ...((await fs.stat(PASTA_PLANOS).catch(() => null)) ? ['--add-dir', PASTA_PLANOS] : []),
    '--append-system-prompt',
    instrucoes(relativa),
    '--allowedTools',
    ...FERRAMENTAS_PERMITIDAS,
    `Edit(${relativa}/**)`,
    `Write(${relativa}/**)`,
    '--disallowedTools',
    ...FERRAMENTAS_PROIBIDAS,
    ...(sessao ? ['--resume', sessao] : []),
  ];
  // os scripts npm que ele rodar gravam na cópia (MINHA_ECONOMIA_DADOS, em server/armazenamento.ts)
  const filho = spawn('claude', args, { cwd: RAIZ, env: { ...process.env, MINHA_ECONOMIA_DADOS: trabalho }, stdio: ['ignore', 'pipe', 'pipe'] });

  let sessaoAtual = sessao;
  let houveTexto = false;
  let buffer = '';
  let erroStderr = '';
  let erroResultado: string | undefined;
  let terminou = false;

  const encerrar = () => {
    if (!terminou && filho.exitCode === null) filho.kill('SIGTERM');
  };
  const limite = setTimeout(encerrar, TEMPO_MAXIMO_MS);
  res.on('close', encerrar); // usuário fechou o chat ou tocou em "parar"

  filho.stderr.on('data', (d: Buffer) => (erroStderr += d.toString()));
  filho.stdout.on('data', (d: Buffer) => {
    buffer += d.toString();
    let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!linha) continue;
      let e: Record<string, any>;
      try {
        e = JSON.parse(linha);
      } catch {
        continue;
      }
      if (e.type === 'system' && e.subtype === 'init' && e.session_id) {
        sessaoAtual = e.session_id;
        enviar({ t: 'sessao', id: e.session_id });
      } else if (e.type === 'system' && e.subtype === 'permission_denied') {
        enviar({ t: 'negado', ferramenta: String(e.tool_name ?? '') });
      } else if (e.type === 'stream_event' && !e.parent_tool_use_id) {
        const ev = e.event ?? {};
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && houveTexto) enviar({ t: 'texto', d: '\n\n' });
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          houveTexto = true;
          enviar({ t: 'texto', d: ev.delta.text });
        }
      } else if (e.type === 'assistant' && !e.parent_tool_use_id) {
        for (const b of e.message?.content ?? []) {
          if (b.type === 'tool_use') enviar({ t: 'passo', texto: descreverPasso(b.name, b.input ?? {}) });
        }
      } else if (e.type === 'result') {
        sessaoAtual = e.session_id ?? sessaoAtual;
        if (e.is_error) erroResultado = String(e.result ?? e.subtype ?? 'erro');
      }
    }
  });

  filho.on('error', (e) => {
    erroStderr += `\n${e.message}`;
  });

  filho.on('close', async (codigo) => {
    terminou = true;
    clearTimeout(limite);
    // o que mudou na cópia é a proposta (o que o usuário mudou no app enquanto isso ficou em data/, fora dela)
    const depois = await lerDados(trabalho);
    const alterados = ARQUIVOS.filter((n) => !mesmoConteudo(antes[n], depois[n]));
    const quebrados = alterados.filter((n) => {
      try {
        lerJson(depois[n]);
        return false;
      } catch {
        return true;
      }
    });
    let erro = erroResultado ?? (quebrados.length ? `O copiloto deixou ${quebrados.join(', ')} com JSON inválido; nada foi proposto.` : undefined);
    if (codigo !== 0 && !erro && !res.writableEnded) {
      erro = /ENOENT/.test(erroStderr)
        ? 'Não encontrei o Claude Code neste Mac (comando "claude").'
        : /log ?in|auth|credential/i.test(erroStderr)
          ? 'O Claude Code precisa de login. Abra o Terminal e rode: claude'
          : erroStderr.trim().split('\n').slice(-2).join(' ') || `o Claude Code saiu com código ${codigo}`;
    }
    const valida = alterados.length > 0 && !quebrados.length;
    if (!valida) await apagarProposta(id);
    const resumo = valida ? alterados.flatMap((n) => resumoDaMudanca(n, lerJson(antes[n]), lerJson(depois[n]))) : [];
    if (!res.writableEnded) {
      enviar({ t: 'fim', sessao: sessaoAtual, alterados: valida ? alterados : [], proposta: valida ? id : null, resumo, ...(erro ? { erro } : {}) });
      res.end();
    }
  });
}

/**
 * OK na proposta: aplica por cima do que está gravado agora. O que o usuário mudou enquanto o copiloto respondia continua;
 * se os dois mexeram no mesmo lugar, nada é aplicado (409 com os conflitos). Tira uma foto antes, para o Desfazer.
 */
async function aplicar(req: IncomingMessage, res: ServerResponse) {
  const { proposta } = await lerCorpo(req);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof proposta !== 'string' || !/^[\w-]+$/.test(proposta)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ erro: 'proposta inválida' }));
  }
  const { trabalho, base } = pastaDaProposta(proposta);
  if (!(await fs.stat(trabalho).catch(() => null))) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ erro: 'essa proposta não existe mais' }));
  }
  const [daBase, daProposta] = await Promise.all([lerDados(base), lerDados(trabalho)]);
  const saida = await emOrdem(async () => {
    const atual = await lerDados();
    const novos: { nome: NomeArquivo; valor: unknown }[] = [];
    const conflitos: string[] = [];
    for (const n of ARQUIVOS) {
      if (mesmoConteudo(daBase[n], daProposta[n])) continue;
      const m = mesclar3(lerJson(daBase[n]), lerJson(atual[n]), lerJson(daProposta[n]), NOMES_ARQUIVO[n]);
      conflitos.push(...m.conflitos);
      // os dois podem ter sincronizado (ele na cópia dele, você no app): o mesmo lançamento não entra duas vezes
      const valor =
        n === 'transacoes' ? tirarRepetidos(m.valor as Transacao[], lerJson(atual[n]) as Transacao[]) : m.valor;
      novos.push({ nome: n, valor });
    }
    if (conflitos.length) return { conflitos };
    const alterados = novos.map((x) => x.nome);
    // a foto sai antes de gravar: se algo der errado no meio, o Desfazer já existe
    const foto = await tirarFoto(
      Object.fromEntries(alterados.map((n) => [n, atual[n]])),
      Object.fromEntries(novos.map((x) => [x.nome, JSON.stringify(x.valor, null, 2) + '\n'])),
    );
    for (const x of novos) await gravar(x.nome, x.valor as Dados[typeof x.nome]);
    return { foto, alterados };
  });
  if ('conflitos' in saida) {
    res.statusCode = 409;
    return res.end(JSON.stringify({ erro: 'mudou enquanto isso', conflitos: saida.conflitos }));
  }
  await apagarProposta(proposta);
  res.end(JSON.stringify({ ok: true, ...saida }));
}

async function descartar(req: IncomingMessage, res: ServerResponse) {
  const { proposta } = await lerCorpo(req);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof proposta === 'string' && /^[\w-]+$/.test(proposta)) await apagarProposta(proposta);
  res.end(JSON.stringify({ ok: true }));
}

const NOMES_ARQUIVO: Record<NomeArquivo, string> = {
  config: 'Plano',
  transacoes: 'Lançamentos',
  metas: 'Metas',
  patrimonio: 'Patrimônio',
  regras: 'Regras',
  desejos: 'Desejos',
};

async function desfazer(req: IncomingMessage, res: ServerResponse) {
  const { foto, arquivos: pedidos } = await lerCorpo(req);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof foto !== 'string' || !/^[\w-]+$/.test(foto)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ erro: 'foto inválida' }));
  }
  const pasta = path.join(PASTA_FOTOS, foto);
  const arquivos = await fs.readdir(pasta).catch(() => null);
  if (!arquivos) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ erro: 'essa versão não existe mais' }));
  }
  // o cartão "Alterei" diz quais arquivos a proposta mexeu
  const so = Array.isArray(pedidos) ? new Set(pedidos.map(String)) : null;
  const nomes = ARQUIVOS.filter((n) => arquivos.includes(`${n}.json`) && (!so || so.has(n)));
  const velhas = nomes.filter((n) => !arquivos.includes(`${n}.depois.json`));
  if (velhas.length) {
    // foto de antes desta versão do app: sem o "depois" não dá para saber o que foi essa mudança e o que veio depois
    res.statusCode = 409;
    return res.end(JSON.stringify({ erro: 'essa mudança é antiga demais para desfazer daqui' }));
  }
  const saida = await emOrdem(async () => {
    const agora = await lerDados();
    const novos: { nome: NomeArquivo; valor: unknown }[] = [];
    const conflitos: string[] = [];
    for (const n of nomes) {
      const antes = await fs.readFile(path.join(pasta, `${n}.json`), 'utf8');
      const depois = await fs.readFile(path.join(pasta, `${n}.depois.json`), 'utf8');
      // volta só o que a proposta mudou: o que chegou depois (sincronização, outro aparelho) continua
      const m = mesclar3(lerJson(depois), lerJson(agora[n]), lerJson(antes), NOMES_ARQUIVO[n]);
      conflitos.push(...m.conflitos);
      novos.push({ nome: n, valor: m.valor });
    }
    if (conflitos.length) return { conflitos };
    await tirarFoto(
      Object.fromEntries(nomes.map((n) => [n, agora[n]])),
      Object.fromEntries(novos.map((x) => [x.nome, JSON.stringify(x.valor, null, 2) + '\n'])),
    ); // dá para desfazer o desfazer
    for (const x of novos) await gravar(x.nome, x.valor as Dados[typeof x.nome]);
    return { ok: true as const };
  });
  if ('conflitos' in saida) {
    res.statusCode = 409;
    return res.end(JSON.stringify({ erro: 'você mudou isso depois; não desfiz nada', conflitos: saida.conflitos }));
  }
  res.end(JSON.stringify({ ok: true }));
}

export function rotasCopiloto() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const rota = (req.url ?? '/').split('?')[0].replace(/\/+$/, '');
    try {
      if (req.method === 'POST' && rota === '/mensagem') return await conversar(req, res);
      if (req.method === 'POST' && rota === '/aplicar') return await aplicar(req, res);
      if (req.method === 'POST' && rota === '/descartar') return await descartar(req, res);
      if (req.method === 'POST' && rota === '/desfazer') return await desfazer(req, res);
      res.statusCode = 404;
      res.end(JSON.stringify({ erro: 'rota desconhecida' }));
    } catch (e) {
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ t: 'fim', sessao: null, alterados: [], proposta: null, resumo: [], erro: (e as Error).message }));
    }
  };
}
