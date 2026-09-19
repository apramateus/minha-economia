// Copiloto: chat com o Claude Code rodando no Mac (assinatura do usuário). No computador fica fixo à esquerda, ao lado
// do menu, e o app continua usável ao lado; no celular abre por cima, em tela cheia. Conversas ficam em localStorage.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleSlash,
  Copy,
  FileDiff,
  History,
  Loader2,
  PanelLeftClose,
  RotateCcw,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { useDados } from '../lib/estado';
import { isoMes, nomeMesCurto, nomeMesLongo } from '../lib/datas';
import { Markdown } from './Markdown';
import { Ajuda } from './ui';

type EstadoProposta = 'pendente' | 'aplicada' | 'descartada' | 'conflito' | 'expirada';

interface Mensagem {
  id: string;
  papel: 'voce' | 'copiloto';
  texto: string;
  passos?: string[];
  /** tamanho do texto quando chegou o último passo: enquanto o texto não cresce, esse passo está rodando */
  textoNoPasso?: number;
  /** arquivos que a proposta muda (nas mensagens antigas, sem proposta: o que o copiloto já tinha alterado) */
  alterados?: string[];
  /** id da proposta no servidor: nada vai para data/ antes do OK */
  proposta?: string;
  resumo?: string[];
  estado?: EstadoProposta;
  conflitos?: string[];
  /** situação da proposta já contada ao copiloto (vai no contexto do pedido seguinte) */
  informado?: string;
  /** foto de antes de aplicar, para o Desfazer */
  foto?: string | null;
  desfeito?: boolean;
  interrompido?: boolean;
  erro?: string;
}

interface Conversa {
  id: string;
  /** a 1ª pergunta */
  titulo: string;
  criada: number;
  atualizada: number;
  /** sessão do Claude Code (--resume) */
  sessao: string | null;
  mensagens: Mensagem[];
}

/** Onde o usuário está: vira o chip do cabeçalho, as sugestões e o contexto mandado ao copiloto. */
export interface ContextoTela {
  tela: string;
  rotulo: string;
  mes?: string;
}

export const LARGURA_MIN = 320;
export const LARGURA_MAX = 640;
export const LARGURA_PADRAO = 400;

const MAX_CONVERSAS = 50;
const MAX_MENSAGENS = 80;
const NENHUMA: Mensagem[] = [];

const NOMES: Record<string, string> = {
  config: 'orçamento',
  regras: 'regras',
  transacoes: 'lançamentos',
  metas: 'metas',
  patrimonio: 'patrimônio',
  desejos: 'desejos',
};

const nomeArquivo = (a: string) => {
  const n = NOMES[a] ?? a;
  return n.charAt(0).toUpperCase() + n.slice(1);
};

/** O que aconteceu com a proposta, contado ao copiloto no pedido seguinte (para ele não achar que já aplicou). */
const SITUACAO: Record<string, string> = {
  pendente: 'pendente (ainda não aplicada)',
  aplicada: 'aplicada',
  desfeita: 'aplicada e depois desfeita',
  descartada: 'descartada (nada aplicado)',
  conflito: 'não aplicada (os dados mudaram no mesmo lugar enquanto isso)',
  expirada: 'não aplicada (expirou)',
};
const situacao = (m: Mensagem) => (m.estado === 'aplicada' && m.desfeito ? 'desfeita' : (m.estado ?? 'pendente'));

/** POST com JSON; nunca lança (sem servidor: status 0). */
async function postar(
  url: string,
  corpo: unknown,
): Promise<{ status: number; resposta: { erro?: string; foto?: string; alterados?: string[]; conflitos?: string[] } }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, resposta: await r.json().catch(() => ({})) };
  } catch {
    return { status: 0, resposta: {} };
  }
}
const deuCerto = (status: number) => status >= 200 && status < 300;

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
}
function gravar(chave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento local: a conversa só não fica salva */
  }
}

const tituloDe = (pergunta: string) => {
  const t = pergunta.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 58)}…` : t;
};

/** Lê as conversas; a conversa única do formato antigo (copiloto.mensagens/.sessao) vira a primeira do histórico. */
function carregar(): { conversas: Conversa[]; atual: string | null } {
  const conversas = ler<Conversa[]>('copiloto.conversas', []);
  const antigas = ler<Mensagem[]>('copiloto.mensagens', []);
  const sessaoAntiga = ler<string | null>('copiloto.sessao', null);
  gravar('copiloto.mensagens', null);
  gravar('copiloto.sessao', null);
  if (antigas.length) {
    const agora = Date.now();
    const c: Conversa = {
      id: `k${agora.toString(36)}`,
      titulo: tituloDe(antigas.find((m) => m.papel === 'voce')?.texto ?? 'Conversa'),
      criada: agora,
      atualizada: agora,
      sessao: sessaoAntiga,
      mensagens: antigas.map((m) => (m.erro === 'Interrompido.' ? { ...m, erro: undefined, interrompido: true } : m)),
    };
    conversas.unshift(c);
    gravar('copiloto.conversas', conversas);
    gravar('copiloto.atual', c.id);
    return { conversas, atual: c.id };
  }
  const atual = ler<string | null>('copiloto.atual', null);
  return { conversas, atual: conversas.some((c) => c.id === atual) ? atual : null };
}

/** "setembro" no ano corrente; "set/2025" nos outros. */
function mesCurto(mes: string) {
  return mes.slice(0, 4) === isoMes().slice(0, 4) ? nomeMesLongo(mes).split(' de ')[0] : nomeMesCurto(mes);
}

function sugestoes({ tela, mes }: ContextoTela): string[] {
  const m = mes ? mesCurto(mes) : 'este mês';
  switch (tela) {
    case 'gastos':
      return ['Por que o não planejado subiu?', 'Quais categorias estouraram este mês?', 'Onde consigo economizar R$ 500 por mês?'];
    case 'extrato':
      return ['Categoriza o que falta', `Quais foram os maiores gastos de ${m}?`, 'Tem alguma cobrança repetida?'];
    case 'orcamento':
      return [`O que estourou em ${m}?`, 'Meu plano cabe na renda?', 'Sugere ajustes no orçamento'];
    case 'categorizar':
      return ['Categoriza o que falta', 'Cria regras para os que se repetem'];
    case 'metas':
      return ['Quando cumpro a próxima meta?', 'Quanto guardo por mês para as metas?'];
    case 'patrimonio':
      return ['Quantos meses de liberdade eu tenho?', 'Como está distribuído meu patrimônio?'];
    case 'custo':
      return ['Onde o real passa do plano?', 'Qual é meu custo real para viver?'];
    default:
      return ['Resume meu mês até agora', 'O que está como não planejado este mês?', 'Onde consigo economizar R$ 500 por mês?'];
  }
}

const SCRIPTS: Record<string, [string, string]> = {
  resumo: ['Rodando o resumo', 'Rodou o resumo'],
  recategorizar: ['Recategorizando', 'Recategorizou'],
  sincronizar: ['Sincronizando com o banco', 'Sincronizou com o banco'],
  importar: ['Importando', 'Importou'],
};

/** Passo do servidor ("Lendo data/transacoes.json") → frase curta ("Leu lançamentos"). */
function descrever(passo: string, rodando: boolean): string {
  const t = (agora: string, antes: string) => (rodando ? agora : antes);
  let m: RegExpMatchArray | null;
  if ((m = passo.match(/^Lendo data\/(\w+)\.json$/))) return `${t('Lendo', 'Leu')} ${NOMES[m[1]] ?? m[1]}`;
  // só prepara: a mudança vai para os dados com o OK no cartão da proposta
  if ((m = passo.match(/^Alterando data\/(\w+)\.json$/))) return `${t('Preparando', 'Preparou')} mudança em ${NOMES[m[1]] ?? m[1]}`;
  if ((m = passo.match(/^Rodando npm run (\w+)(.*)$/))) {
    const [agora, antes] = SCRIPTS[m[1]] ?? [`Rodando ${m[1]}`, `Rodou ${m[1]}`];
    const mes = m[2].match(/\b(\d{4}-\d{2})\b/)?.[1];
    return t(agora, antes) + (mes ? ` de ${mesCurto(mes)}` : '');
  }
  if ((m = passo.match(/^Procurando (.+)$/))) return `${t('Procurando', 'Procurou')} “${m[1]}”`;
  if ((m = passo.match(/^Pesquisando: (.+)$/))) return `${t('Pesquisando', 'Pesquisou')} “${m[1]}”`;
  if ((m = passo.match(/^Lendo (.+)$/))) return `${t('Lendo', 'Leu')} ${m[1]}`;
  if ((m = passo.match(/^Alterando (.+)$/))) return `${t('Alterando', 'Alterou')} ${m[1]}`;
  return passo;
}
const negado = (passo: string) => passo.startsWith('Sem permissão');

function passoRodando(m: Mensagem, gerando: boolean) {
  const ultimo = m.passos?.at(-1);
  return gerando && !!ultimo && !negado(ultimo) && m.texto.length === m.textoNoPasso;
}

function quando(ts: number) {
  const d = new Date(ts);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function agrupar(conversas: Conversa[]) {
  const inicioHoje = new Date().setHours(0, 0, 0, 0);
  const dia = 86_400_000;
  const faixas: [string, number][] = [
    ['Hoje', inicioHoje],
    ['Ontem', inicioHoje - dia],
    ['Últimos 7 dias', inicioHoje - 7 * dia],
    ['Últimos 30 dias', inicioHoje - 30 * dia],
    ['Mais antigas', -Infinity],
  ];
  const grupos = faixas.map(([rotulo]) => ({ rotulo, itens: [] as Conversa[] }));
  for (const c of [...conversas].sort((a, b) => b.atualizada - a.atualizada)) {
    grupos[faixas.findIndex(([, desde]) => c.atualizada >= desde)].itens.push(c);
  }
  return grupos.filter((g) => g.itens.length);
}

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return;
  } catch {
    /* http://<nome-do-mac>.local não é "seguro": o iPhone não libera a área de transferência */
  }
  const el = document.createElement('textarea');
  el.value = texto;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  el.remove();
}

function BotaoIcone({
  rotulo,
  onClick,
  children,
  ativo,
  disabled,
}: {
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
  ativo?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo}
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-35 ${
        ativo ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function Passos({ passos, rodando }: { passos: string[]; rodando: boolean }) {
  const [aberto, setAberto] = useState(false);
  const varios = passos.length > 1;
  const algumNegado = passos.some(negado);
  const titulo = rodando ? descrever(passos.at(-1)!, true) : varios ? `${passos.length} passos` : descrever(passos[0], false);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => varios && setAberto((a) => !a)}
        className={`flex max-w-full items-center gap-1.5 rounded-md py-0.5 text-xs text-muted ${varios ? 'hover:text-ink-2' : 'cursor-default'}`}
        aria-expanded={varios ? aberto : undefined}
      >
        {rodando ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-accent" />
        ) : algumNegado ? (
          <TriangleAlert size={12} className="shrink-0 text-warning-text" />
        ) : (
          <Check size={12} className="shrink-0" />
        )}
        <span className="truncate">{titulo}</span>
        {rodando && varios && <span className="shrink-0 tabular">· {passos.length}</span>}
        {varios && <ChevronRight size={12} className={`shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} />}
      </button>
      {aberto && varios && (
        <ol className="ml-[5px] mt-1 space-y-1 border-l border-borda py-0.5 pl-3">
          {passos.map((p, i) => {
            const agora = rodando && i === passos.length - 1;
            return (
              <li key={i} className={`flex items-center gap-1.5 text-xs ${negado(p) ? 'text-warning-text' : 'text-muted'}`}>
                {agora && <Loader2 size={11} className="shrink-0 animate-spin text-accent" />}
                {negado(p) && <TriangleAlert size={11} className="shrink-0" />}
                <span className="truncate">{descrever(p, agora)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AcoesResposta({ texto, sempre, onRefazer }: { texto: string; sempre: boolean; onRefazer?: () => void }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(t);
  }, [copiado]);
  return (
    <div
      className={`-ml-1.5 mt-1 flex items-center gap-0.5 transition-opacity ${
        sempre ? '' : 'lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100'
      }`}
    >
      <BotaoIcone rotulo={copiado ? 'Copiado' : 'Copiar'} onClick={() => copiarTexto(texto).then(() => setCopiado(true))}>
        {copiado ? <Check size={14} /> : <Copy size={14} />}
      </BotaoIcone>
      {onRefazer && (
        <BotaoIcone rotulo="Refazer" onClick={onRefazer}>
          <RotateCcw size={14} />
        </BotaoIcone>
      )}
    </div>
  );
}

const BOTAO_DESFAZER = '-my-1 ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-accent-strong hover:bg-surface-2';

/** O que o copiloto quer mudar: só vai para os dados com o OK. Mensagens antigas (sem proposta) mostram o que ele já tinha alterado. */
function CartaoMudanca({
  m,
  onAplicar,
  onDescartar,
  onDesfazer,
}: {
  m: Mensagem;
  onAplicar: () => Promise<void>;
  onDescartar: () => Promise<void>;
  onDesfazer: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<'aplicar' | 'descartar' | 'desfazer' | null>(null);
  const fazer = (qual: 'aplicar' | 'descartar' | 'desfazer', acao: () => Promise<void>) => async () => {
    setOcupado(qual);
    try {
      await acao();
    } finally {
      setOcupado(null);
    }
  };
  const girando = <Loader2 size={13} className="shrink-0 animate-spin" />;
  const desfazer = m.foto && !m.desfeito && (
    <button type="button" onClick={fazer('desfazer', onDesfazer)} disabled={!!ocupado} className={BOTAO_DESFAZER}>
      {ocupado === 'desfazer' ? girando : <Undo2 size={13} />} Desfazer
    </button>
  );

  if (!m.proposta)
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-borda px-3 py-2 text-xs">
        {m.desfeito ? <Undo2 size={13} className="shrink-0 text-muted" /> : <Check size={13} className="shrink-0 text-good-text" />}
        <span className="min-w-0 flex-1 text-ink-2">
          {m.desfeito ? 'Desfeito: ' : 'Alterei: '}
          <span className="font-medium text-ink">{(m.alterados ?? []).map((a) => NOMES[a] ?? a).join(', ')}</span>
        </span>
        {desfazer}
      </div>
    );

  const itens = m.resumo?.length ? m.resumo : (m.alterados ?? []).map(nomeArquivo);
  if (m.estado === 'descartada' || m.estado === 'expirada')
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted" title={itens.join('\n')}>
        {m.estado === 'descartada' ? <X size={13} className="shrink-0" /> : <CircleSlash size={13} className="shrink-0" />}
        {m.estado === 'descartada' ? 'Descartado' : 'Proposta não existe mais'}
      </p>
    );

  const pendente = m.estado === 'pendente';
  const conflito = m.estado === 'conflito';
  const botao = 'flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition-colors disabled:opacity-50 max-lg:py-1.5';
  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
        pendente ? 'border-accent/40 bg-accent-weak/40' : conflito ? 'border-warning/50' : 'border-borda'
      }`}
    >
      <div className="flex min-h-6 items-center gap-1.5">
        {pendente ? (
          <FileDiff size={13} className="shrink-0 text-accent-strong" />
        ) : conflito ? (
          <TriangleAlert size={13} className="shrink-0 text-warning-text" />
        ) : m.desfeito ? (
          <Undo2 size={13} className="shrink-0 text-muted" />
        ) : (
          <Check size={13} className="shrink-0 text-good-text" />
        )}
        {pendente ? (
          <>
            <span className="font-semibold text-ink">Quer aplicar?</span>
            <Ajuda>O copiloto preparou estas mudanças à parte. Seus dados só mudam com o OK.</Ajuda>
          </>
        ) : conflito ? (
          <>
            <span className="min-w-0 text-ink-2">
              Mudou enquanto isso
              {!!m.conflitos?.length && (
                <>
                  : <span className="font-medium text-ink">{m.conflitos.map((c) => NOMES[c] ?? c).join(', ')}</span>
                </>
              )}
            </span>
            <Ajuda>Nada foi aplicado: esses dados mudaram depois do pedido. Descarte e peça de novo.</Ajuda>
          </>
        ) : (
          <span className="font-medium text-ink">{m.desfeito ? 'Desfeito' : 'Aplicado'}</span>
        )}
        {desfazer}
      </div>
      <ul className={`mt-0.5 space-y-0.5 pl-[19px] ${m.desfeito ? 'text-muted' : 'text-ink-2'}`}>
        {itens.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {(pendente || conflito) && (
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={fazer('descartar', onDescartar)}
            disabled={!!ocupado}
            className={`${botao} text-ink-2 hover:bg-surface-2 hover:text-ink`}
          >
            {ocupado === 'descartar' && girando} Descartar
          </button>
          {pendente && (
            <button type="button" onClick={fazer('aplicar', onAplicar)} disabled={!!ocupado} className={`${botao} bg-accent text-white hover:opacity-90`}>
              {ocupado === 'aplicar' ? girando : <Check size={13} />} OK
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Historico({
  conversas,
  atual,
  rodando,
  onAbrir,
  onApagar,
}: {
  conversas: Conversa[];
  atual: string | null;
  rodando: string | null;
  onAbrir: (id: string) => void;
  onApagar: (id: string) => void;
}) {
  if (!conversas.length) return <div className="flex flex-1 items-center justify-center text-sm text-muted">Nenhuma conversa</div>;
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
      {agrupar(conversas).map((g) => (
        <section key={g.rotulo}>
          <h3 className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.rotulo}</h3>
          <ul>
            {g.itens.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onAbrir(c.id)}
                  aria-current={c.id === atual ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-10 text-left text-sm lg:pr-2.5 ${
                    c.id === atual ? 'bg-accent-weak text-accent-strong' : 'text-ink hover:bg-surface-2'
                  }`}
                >
                  {rodando === c.id && <Loader2 size={13} className="shrink-0 animate-spin text-accent" />}
                  <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
                  <span className="tabular shrink-0 text-xs text-muted max-lg:hidden lg:group-focus-within:invisible lg:group-hover:invisible">
                    {quando(c.atualizada)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onApagar(c.id)}
                  title="Apagar conversa"
                  aria-label="Apagar conversa"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:bg-surface hover:text-critical focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Copiloto({
  aberto,
  onFechar,
  contexto,
  computador,
  esquerda,
  largura,
  onLargura,
  onRodando,
}: {
  aberto: boolean;
  onFechar: () => void;
  contexto: ContextoTela;
  /** ≥ 1024 px: painel fixo à esquerda (`esquerda` = largura do menu); senão, tela cheia por cima */
  computador: boolean;
  esquerda: number;
  largura: number;
  onLargura: (px: number) => void;
  /** avisa se há resposta sendo gerada (para o botão mostrar atividade com o painel recolhido) */
  onRodando?: (rodando: boolean) => void;
}) {
  const { recarregar, aviso } = useDados();
  const [inicial] = useState(carregar);
  const [conversas, setConversas] = useState<Conversa[]>(inicial.conversas);
  const [atualId, setAtualId] = useState<string | null>(inicial.atual);
  const [historico, setHistorico] = useState(false);
  const [texto, setTexto] = useState('');
  /** id da conversa cuja resposta está chegando */
  const [rodando, setRodando] = useState<string | null>(null);
  const [longeDoFim, setLongeDoFim] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const abortar = useRef<AbortController | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);
  const campo = useRef<HTMLTextAreaElement>(null);

  const atual = conversas.find((c) => c.id === atualId) ?? null;
  const mensagens = atual?.mensagens ?? NENHUMA;
  const outraRodando = rodando !== null && rodando !== atualId;

  // grava com um respiro: durante a resposta o texto muda a cada pedacinho
  const pendente = useRef<(() => void) | null>(null);
  useEffect(() => {
    const salvar = () => {
      pendente.current = null;
      const recentes = [...conversas].sort((a, b) => b.atualizada - a.atualizada).slice(0, MAX_CONVERSAS);
      gravar('copiloto.conversas', recentes.map((c) => ({ ...c, mensagens: c.mensagens.slice(-MAX_MENSAGENS) })));
      gravar('copiloto.atual', atualId);
    };
    pendente.current = salvar;
    const t = setTimeout(salvar, 400);
    return () => clearTimeout(t);
  }, [conversas, atualId]);
  useEffect(() => {
    const agora = () => pendente.current?.();
    window.addEventListener('pagehide', agora);
    return () => window.removeEventListener('pagehide', agora);
  }, []);

  useEffect(() => {
    onRodando?.(rodando !== null);
  }, [rodando, onRodando]);

  // rola junto com a resposta só se você está no fim (lendo lá em cima, fica parado)
  const irParaFim = (suave?: boolean) => {
    const el = rolagem.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
  };
  useLayoutEffect(() => {
    if (grudado.current) irParaFim();
  }, [mensagens, aberto, historico]);
  const aoRolar = () => {
    const el = rolagem.current;
    if (!el) return;
    const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
    grudado.current = distancia < 48;
    setLongeDoFim(distancia > 160);
  };

  // campo que cresce sozinho
  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [texto, aberto, historico, largura]);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => campo.current?.focus(), 50);
    if (computador) return () => clearTimeout(t);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = overflow;
    };
  }, [aberto, computador]);

  const mexer = (id: string, fn: (c: Conversa) => Conversa) => setConversas((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  const enviar = async (pergunta: string, base: Conversa | null = atual) => {
    const t = pergunta.trim();
    if (!t || rodando) return;
    const agora = Date.now();
    const sufixo = agora.toString(36);
    const idResposta = `c${sufixo}`;
    const novas: Mensagem[] = [
      { id: `v${sufixo}`, papel: 'voce', texto: t },
      { id: idResposta, papel: 'copiloto', texto: '', passos: [] },
    ];
    const convId = base?.id ?? `k${sufixo}`;
    // o que aconteceu com as propostas desta conversa desde o último pedido (o copiloto não vê o OK/Descartar)
    const mudaram = (base?.mensagens ?? []).filter((m) => m.proposta && m.informado !== situacao(m));
    const propostas = mudaram.map(
      (m) => `Proposta ${mudaram.length > 1 ? `"${tituloDe((m.resumo ?? []).join('; '))}"` : 'anterior'}: ${SITUACAO[situacao(m)]}`,
    );
    const informadas = new Map(mudaram.map((m) => [m.id, situacao(m)]));
    if (base)
      mexer(convId, (c) => ({
        ...c,
        atualizada: agora,
        mensagens: [...c.mensagens.map((m) => (informadas.has(m.id) ? { ...m, informado: informadas.get(m.id) } : m)), ...novas],
      }));
    else setConversas((cs) => [{ id: convId, titulo: tituloDe(t), criada: agora, atualizada: agora, sessao: null, mensagens: novas }, ...cs]);
    setAtualId(convId);
    setHistorico(false);
    setTexto('');
    setRodando(convId);
    grudado.current = true;

    const resposta = (fn: (m: Mensagem) => Mensagem) =>
      mexer(convId, (c) => ({ ...c, mensagens: c.mensagens.map((m) => (m.id === idResposta ? fn(m) : m)) }));
    const ctrl = new AbortController();
    abortar.current = ctrl;
    try {
      const r = await fetch('/api/copiloto/mensagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: t,
          sessao: base?.sessao ?? null,
          contexto: [
            `o usuário está na tela "${contexto.rotulo}"${contexto.mes ? `, vendo ${nomeMesLongo(contexto.mes)}` : ''}`,
            ...propostas,
          ].join('. '),
        }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) throw new Error(`Erro ${r.status}`);
      const leitor = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const linha = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!linha.trim()) continue;
          const e = JSON.parse(linha);
          if (e.t === 'sessao') mexer(convId, (c) => ({ ...c, sessao: e.id }));
          else if (e.t === 'texto') resposta((m) => ({ ...m, texto: m.texto + e.d }));
          else if (e.t === 'passo') resposta((m) => ({ ...m, passos: [...(m.passos ?? []), e.texto], textoNoPasso: m.texto.length }));
          else if (e.t === 'negado') resposta((m) => ({ ...m, passos: [...(m.passos ?? []), `Sem permissão: ${e.ferramenta}`] }));
          else if (e.t === 'fim') {
            mexer(convId, (c) => ({
              ...c,
              sessao: e.sessao ?? c.sessao,
              atualizada: Date.now(),
              mensagens: c.mensagens.map((m) =>
                m.id === idResposta
                  ? {
                      ...m,
                      ...(e.proposta
                        ? { proposta: e.proposta, estado: 'pendente' as const, resumo: e.resumo ?? [], alterados: e.alterados ?? [] }
                        : {}),
                      ...(e.erro ? { erro: e.erro } : {}),
                    }
                  : m,
              ),
            }));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') resposta((m) => ({ ...m, interrompido: true }));
      else resposta((m) => ({ ...m, erro: `Não consegui falar com o copiloto: ${(e as Error).message}` }));
    } finally {
      abortar.current = null;
      setRodando(null);
    }
  };

  const refazer = () => {
    if (!atual || rodando) return;
    const i = atual.mensagens.findLastIndex((m) => m.papel === 'voce');
    if (i < 0) return;
    // a resposta refeita traz a sua própria proposta: a que ficaria para trás não serve mais
    for (const m of atual.mensagens.slice(i))
      if (m.proposta && (m.estado === 'pendente' || m.estado === 'conflito')) void postar('/api/copiloto/descartar', { proposta: m.proposta });
    const base = { ...atual, mensagens: atual.mensagens.slice(0, i) };
    mexer(atual.id, () => base);
    enviar(atual.mensagens[i].texto, base);
  };

  const mexerMensagem = (convId: string, id: string, mudar: Partial<Mensagem>) =>
    mexer(convId, (c) => ({ ...c, mensagens: c.mensagens.map((x) => (x.id === id ? { ...x, ...mudar } : x)) }));

  const aplicar = async (m: Mensagem) => {
    if (!m.proposta || !atual) return;
    const convId = atual.id;
    const { status, resposta } = await postar('/api/copiloto/aplicar', { proposta: m.proposta });
    if (deuCerto(status)) {
      mexerMensagem(convId, m.id, { estado: 'aplicada', foto: resposta.foto ?? null, alterados: resposta.alterados ?? m.alterados });
      await recarregar();
    } else if (status === 409) mexerMensagem(convId, m.id, { estado: 'conflito', conflitos: resposta.conflitos ?? [] });
    else if (status === 404) mexerMensagem(convId, m.id, { estado: 'expirada' });
    else aviso(resposta.erro ?? 'Não consegui aplicar', 'erro');
  };

  const descartar = async (m: Mensagem) => {
    if (!m.proposta || !atual) return;
    const convId = atual.id;
    const { status, resposta } = await postar('/api/copiloto/descartar', { proposta: m.proposta });
    if (deuCerto(status) || status === 404) mexerMensagem(convId, m.id, { estado: 'descartada' });
    else aviso(resposta.erro ?? 'Não consegui descartar', 'erro');
  };

  const desfazer = async (m: Mensagem) => {
    if (!m.foto || !atual) return;
    const convId = atual.id;
    const { status } = await postar('/api/copiloto/desfazer', { foto: m.foto, arquivos: m.alterados });
    if (deuCerto(status)) {
      await recarregar();
      mexerMensagem(convId, m.id, { desfeito: true });
      aviso('Alterações desfeitas');
    } else aviso('Não consegui desfazer', 'erro');
  };

  // no celular, focar abriria o teclado por cima da conversa
  const focarCampo = () => computador && setTimeout(() => campo.current?.focus(), 0);

  const novaConversa = () => {
    setAtualId(null);
    setHistorico(false);
    setTexto('');
    grudado.current = true;
    focarCampo();
  };

  const abrirConversa = (id: string) => {
    setAtualId(id);
    setHistorico(false);
    grudado.current = true;
    focarCampo();
  };

  const apagar = (id: string) => {
    const c = conversas.find((x) => x.id === id);
    if (!c) return;
    if (rodando === id) abortar.current?.abort();
    setConversas((cs) => cs.filter((x) => x.id !== id));
    if (atualId === id) setAtualId(null);
    aviso('Conversa apagada', 'ok', {
      rotulo: 'Desfazer',
      fazer: () => setConversas((cs) => (cs.some((x) => x.id === id) ? cs : [...cs, c])),
    });
  };

  // arrastar a borda direita ajusta a largura (o App limita e guarda)
  const comecarArraste = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const alvo = e.currentTarget;
    const x0 = e.clientX;
    const l0 = largura;
    alvo.setPointerCapture(e.pointerId);
    setArrastando(true);
    const estilo = { cursor: document.body.style.cursor, selecao: document.body.style.userSelect };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mover = (ev: PointerEvent) => onLargura(Math.round(l0 + ev.clientX - x0));
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover);
      alvo.removeEventListener('pointerup', soltar);
      alvo.removeEventListener('pointercancel', soltar);
      document.body.style.cursor = estilo.cursor;
      document.body.style.userSelect = estilo.selecao;
      setArrastando(false);
    };
    alvo.addEventListener('pointermove', mover);
    alvo.addEventListener('pointerup', soltar);
    alvo.addEventListener('pointercancel', soltar);
  };

  const chip = `${contexto.rotulo}${contexto.mes ? ` · ${mesCurto(contexto.mes)}` : ''}`;
  const ultimaResposta = mensagens.findLastIndex((m) => m.papel === 'copiloto');

  return (
    <aside
      aria-label="Copiloto"
      role={computador ? undefined : 'dialog'}
      aria-modal={computador ? undefined : true}
      className={`${aberto ? 'flex' : 'hidden'} fixed flex-col bg-surface ${
        computador ? 'inset-y-0 z-20 border-r border-borda' : 'inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 pt-safe'
      }`}
      style={computador ? { left: esquerda, width: largura } : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        if (historico) setHistorico(false);
        else if (!computador) onFechar();
        else return;
        e.stopPropagation();
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-borda pl-4 pr-2">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <h2 className="shrink-0 text-sm font-semibold">{historico ? 'Histórico' : 'Copiloto'}</h2>
        {!historico && (
          <span className="min-w-0 truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2" title="Contexto enviado junto">
            {chip}
          </span>
        )}
        <div className="ml-auto flex items-center">
          <BotaoIcone rotulo="Nova conversa" onClick={novaConversa} disabled={!atual && !historico}>
            <SquarePen size={16} />
          </BotaoIcone>
          <BotaoIcone rotulo="Histórico" onClick={() => setHistorico((h) => !h)} ativo={historico}>
            <History size={16} />
          </BotaoIcone>
          <BotaoIcone rotulo={computador ? 'Recolher (⌘J)' : 'Fechar'} onClick={onFechar}>
            {computador ? <PanelLeftClose size={16} /> : <X size={18} />}
          </BotaoIcone>
        </div>
      </header>

      {historico ? (
        <Historico conversas={conversas} atual={atualId} rodando={rodando} onAbrir={abrirConversa} onApagar={apagar} />
      ) : (
        <div className="relative min-h-0 flex-1">
          <div ref={rolagem} onScroll={aoRolar} className="h-full overflow-y-auto overscroll-contain">
            {mensagens.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 pb-12">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-weak text-accent-strong">
                  <Sparkles size={22} />
                </div>
                <div className="flex max-w-sm flex-wrap justify-center gap-2">
                  {sugestoes(contexto).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      disabled={outraRodando}
                      className="rounded-full border border-borda px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="mx-auto max-w-2xl space-y-6 px-4 py-5">
                {mensagens.map((m, idx) => {
                  if (m.papel === 'voce')
                    return (
                      <li key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface-2 px-3.5 py-2 text-sm">
                          {m.texto}
                        </div>
                      </li>
                    );
                  const gerando = rodando === atualId && idx === mensagens.length - 1;
                  const noPasso = passoRodando(m, gerando);
                  const mudou = !!m.proposta || (m.alterados?.length ?? 0) > 0;
                  // refazer com mudança ainda valendo faria a mudança de novo
                  const valendo = (m.proposta ? m.estado === 'aplicada' : mudou) && !m.desfeito;
                  return (
                    <li key={m.id} className="group">
                      {(m.passos?.length ?? 0) > 0 && <Passos passos={m.passos!} rodando={noPasso} />}
                      {m.texto ? (
                        <Markdown texto={m.texto} cursor={gerando && !noPasso} />
                      ) : (
                        gerando &&
                        !noPasso && (
                          <span className="inline-flex items-center gap-2 text-sm text-muted">
                            <Sparkles size={14} className="animate-pulse text-accent" /> Pensando…
                          </span>
                        )
                      )}
                      {m.interrompido && <p className="mt-2 text-xs text-muted">Interrompido</p>}
                      {m.erro && (
                        <p className="mt-2 flex items-start gap-2 rounded-lg border border-critical/30 px-3 py-2 text-sm text-critical">
                          <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {m.erro}
                        </p>
                      )}
                      {mudou && (
                        <CartaoMudanca
                          m={m}
                          onAplicar={() => aplicar(m)}
                          onDescartar={() => descartar(m)}
                          onDesfazer={() => desfazer(m)}
                        />
                      )}
                      {!gerando && m.texto && (
                        <AcoesResposta
                          texto={m.texto}
                          sempre={idx === ultimaResposta}
                          onRefazer={idx === ultimaResposta && !rodando && !valendo ? refazer : undefined}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {longeDoFim && mensagens.length > 0 && (
            <button
              type="button"
              onClick={() => irParaFim(true)}
              aria-label="Ir para o fim"
              title="Ir para o fim"
              className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-borda bg-surface text-ink-2 shadow-md hover:text-ink"
            >
              <ArrowDown size={16} />
            </button>
          )}
        </div>
      )}

      {!historico && (
        <form
          className={`shrink-0 px-3 pt-1 ${computador ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-borda bg-page py-2 pl-3.5 pr-2 transition-colors focus-within:border-accent">
            <textarea
              ref={campo}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              placeholder={atual ? 'Responder…' : 'Pergunte ou peça algo…'}
              className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent py-1 text-base leading-6 text-ink outline-none placeholder:text-muted lg:text-sm"
              aria-label="Mensagem para o copiloto"
            />
            {rodando && !outraRodando ? (
              <button
                type="button"
                onClick={() => abortar.current?.abort()}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-page"
                aria-label="Parar"
                title="Parar"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!texto.trim() || outraRodando}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-30"
                aria-label="Enviar"
                title="Enviar (⏎)"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </form>
      )}

      {computador && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Largura do copiloto"
          aria-valuemin={LARGURA_MIN}
          aria-valuemax={LARGURA_MAX}
          aria-valuenow={largura}
          tabIndex={0}
          title="Arraste para ajustar · duplo clique volta ao padrão"
          onPointerDown={comecarArraste}
          onDoubleClick={() => onLargura(LARGURA_PADRAO)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              onLargura(largura + (e.key === 'ArrowRight' ? 16 : -16));
            }
          }}
          className="group/borda absolute inset-y-0 -right-1.5 z-10 flex w-3 cursor-col-resize justify-center outline-none"
        >
          <div
            className={`h-full w-0.5 transition-colors ${
              arrastando ? 'bg-accent' : 'bg-transparent group-hover/borda:bg-accent/60 group-focus-visible/borda:bg-accent'
            }`}
          />
        </div>
      )}
    </aside>
  );
}
