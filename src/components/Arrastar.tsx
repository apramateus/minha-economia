// Arrastar e soltar nas listas de categorias (Gastos → Pastas e Custo para viver): uma categoria para dentro de outra
// (ou para fora, pela faixa "Tirar de…"), ou itens do detalhe (um estabelecimento ou um lançamento) para uma pasta — os
// lançamentos passam a ser dela. Envolve a lista (e o detalhe) num só DndContext. Só com o mouse: no toque, segurar o dedo
// abre o menu (categoria → "Mover para ▸"; estabelecimento ou lançamento → "Categoria ▸").
import { createContext, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronsDownUp, ChevronsUpDown, CornerLeftUp, Folder, Home, Receipt } from 'lucide-react';
import { useDados } from '../lib/estado';
import { caminho, descendentes, temFilhas } from '../lib/categorias';
import { NAO_PLANEJADO } from '../lib/analise';
import type { LinhaOrcamento } from '../lib/tipos';
import { useOperacoesCategorias } from './AcoesCategoria';

export const RAIZ = '_raiz';
const NENHUMA: ReadonlySet<string> = new Set();

/** O que está sendo arrastado: uma categoria, ou lançamentos (de um estabelecimento ou um só). */
export type Arrastado = { tipo: 'categoria'; id: string; nome: string; cor: string } | { tipo: 'lancamentos'; ids: string[]; nome: string };

interface Contexto {
  arrastado: Arrastado | null;
  /** alvo sob o ponteiro (id da categoria, NAO_PLANEJADO ou RAIZ) */
  sobre: string | null;
  /** a categoria arrastada e as de dentro dela: não recebem o arraste */
  bloqueadas: ReadonlySet<string>;
  fechadas: Set<string>;
  setFechadas: (f: (atual: Set<string>) => Set<string>) => void;
  /** hora em que o último arraste terminou (o clique que vem logo depois não abre nada) */
  acabouDeArrastar: MutableRefObject<number>;
  /** a categoria acabou de ser movida (a lista rola até ela) */
  movida: string | null;
}

const Ctx = createContext<Contexto | null>(null);

export function useArrastar(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useArrastar fora do AreaDeArrastar');
  return c;
}

/** Uma categoria pode receber este arraste? (não dentro dela mesma nem de uma das suas; lançamentos: qualquer uma) */
export function podeSoltar(config: Parameters<typeof descendentes>[0], a: Arrastado | null, alvo: string): boolean {
  if (!a) return false;
  if (a.tipo === 'lancamentos') return true;
  return alvo !== NAO_PLANEJADO && !descendentes(config, a.id).has(alvo);
}

function lerFechadas(chave: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(chave) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** O alvo do soltar: a barra "Tirar de…" usa `sair:<id>` (a categoria de cima) e `_raiz…` (nível principal). */
const idDoAlvo = (id: string | number | undefined | null) => {
  if (id == null) return null;
  const s = String(id);
  return s.startsWith(RAIZ) ? RAIZ : s.startsWith('sair:') ? s.slice(5) : s;
};

/** `chave` = onde ficam lembradas as pastas fechadas (cada lista tem as suas). */
export function AreaDeArrastar({ chave = 'categorias.fechadas', children }: { chave?: string; children: ReactNode }) {
  const { dados } = useDados();
  const { config } = dados;
  const { mover, recategorizar } = useOperacoesCategorias();
  const [fechadas, setFechadas] = useState<Set<string>>(() => lerFechadas(chave));
  const [arrastado, setArrastado] = useState<Arrastado | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [movida, setMovida] = useState<string | null>(null);
  const acabouDeArrastar = useRef(0);
  const abrirDepois = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify([...fechadas]));
    } catch {
      /* navegação privada: tudo bem */
    }
  }, [chave, fechadas]);

  const bloqueadas = useMemo(() => (arrastado?.tipo === 'categoria' ? descendentes(config, arrastado.id) : NENHUMA), [arrastado, config]);

  const sensores = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }));

  // se o botão for solto antes de o arraste terminar de começar (movimento muito rápido), o dnd-kit não avisa o fim:
  // não pode ficar preso arrastando
  useEffect(() => {
    if (!arrastado) return;
    let soltou: ReturnType<typeof setTimeout> | undefined;
    const aoSoltar = () => {
      soltou = setTimeout(() => {
        setArrastado(null);
        setSobre(null);
      }, 50);
    };
    window.addEventListener('pointerup', aoSoltar);
    return () => {
      window.removeEventListener('pointerup', aoSoltar);
      clearTimeout(soltou);
    };
  }, [arrastado]);

  const limpar = () => {
    if (abrirDepois.current) clearTimeout(abrirDepois.current);
    setArrastado(null);
    setSobre(null);
    acabouDeArrastar.current = Date.now();
  };

  const aoComecar = (e: DragStartEvent) => setArrastado((e.active.data.current as Arrastado | undefined) ?? null);
  const aoPassar = (e: DragOverEvent) => {
    const id = idDoAlvo(e.over?.id);
    setSobre(id);
    if (abrirDepois.current) clearTimeout(abrirDepois.current);
    // pasta fechada abre sozinha depois de um tempinho com o item parado em cima (como no Finder)
    if (id && id !== RAIZ && fechadas.has(id))
      abrirDepois.current = setTimeout(() => setFechadas((f) => (f.has(id) ? new Set([...f].filter((x) => x !== id)) : f)), 700);
  };
  const aoTerminar = async (e: DragEndEvent) => {
    const a = (e.active.data.current as Arrastado | undefined) ?? null;
    const alvo = idDoAlvo(e.over?.id);
    limpar();
    if (!a || !alvo) return;
    if (a.tipo === 'lancamentos') {
      if (alvo === RAIZ) return;
      await recategorizar(a.ids, alvo === NAO_PLANEJADO ? null : alvo);
      return;
    }
    if (alvo === NAO_PLANEJADO) return;
    const destino = alvo === RAIZ ? null : alvo;
    const atual = config.orcamento.find((l) => l.id === a.id)?.pai ?? null;
    if (destino === atual || (destino && descendentes(config, a.id).has(destino))) return;
    if (!(await mover(a.id, destino))) return;
    if (destino) setFechadas((f) => (f.has(destino) ? new Set([...f].filter((x) => x !== destino)) : f));
    setMovida(a.id);
  };

  return (
    <Ctx.Provider value={{ arrastado, sobre, bloqueadas, fechadas, setFechadas, acabouDeArrastar, movida }}>
      <DndContext
        sensors={sensores}
        collisionDetection={pointerWithin}
        onDragStart={aoComecar}
        onDragOver={aoPassar}
        onDragEnd={aoTerminar}
        onDragCancel={limpar}
        autoScroll={{ threshold: { x: 0, y: 0.15 } }}
      >
        {children}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {arrastado && (
              <div className="flex w-max max-w-72 items-center gap-2 rounded-lg border border-accent bg-surface px-3 py-1.5 text-sm font-semibold shadow-2xl">
                {arrastado.tipo === 'categoria' ? (
                  <Folder size={16} className="shrink-0" style={{ color: arrastado.cor }} fill="currentColor" fillOpacity={0.18} />
                ) : (
                  <Receipt size={15} className="shrink-0 text-muted" />
                )}
                <span className="truncate">{arrastado.nome}</span>
                {arrastado.tipo === 'lancamentos' && arrastado.ids.length > 1 && (
                  <span className="shrink-0 text-xs font-normal text-muted">× {arrastado.ids.length}</span>
                )}
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </Ctx.Provider>
  );
}

/** Deixa arrastar lançamentos (um estabelecimento inteiro ou um só) para uma pasta. */
export function useLancamentosArrastaveis(chave: string, ids: string[], nome: string) {
  return useDraggable({ id: `lanc:${chave}`, data: { tipo: 'lancamentos', ids, nome } satisfies Arrastado });
}

/**
 * Linha de categoria que arrasta (para dentro de outra pasta) e recebe (uma pasta, ou lançamentos do detalhe).
 * `alvo`: soltando agora, cai nela (a pasta onde a arrastada já está não conta); `bloqueada`: é a arrastada ou uma das de dentro.
 */
export function useCategoriaArrastavel(l: LinhaOrcamento, cor: string, semArrastar: boolean) {
  const { dados } = useDados();
  const { arrastado, sobre, bloqueadas } = useArrastar();
  const arrastar = useDraggable({ id: l.id, disabled: semArrastar, data: { tipo: 'categoria', id: l.id, nome: l.nome, cor } satisfies Arrastado });
  const bloqueada = bloqueadas.has(l.id);
  const soltar = useDroppable({ id: l.id, disabled: bloqueada });
  const alvo =
    sobre === l.id &&
    !bloqueada &&
    !!arrastado &&
    (arrastado.tipo === 'lancamentos' || dados.config.orcamento.find((x) => x.id === arrastado.id)?.pai !== l.id);
  return {
    ref: (el: HTMLElement | null) => {
      arrastar.setNodeRef(el);
      soltar.setNodeRef(el);
    },
    props: { ...arrastar.listeners, ...arrastar.attributes },
    arrastando: arrastar.isDragging,
    bloqueada,
    alvo,
  };
}

/** Faixa no topo da lista enquanto arrasta uma pasta que está dentro de outra: os níveis de cima (menos o de agora) viram alvos para tirá-la de lá. */
export function FaixaTirarDe() {
  const { dados } = useDados();
  const { arrastado } = useArrastar();
  const acima = arrastado?.tipo === 'categoria' ? caminho(dados.config, arrastado.id).slice(0, -1) : [];
  if (!acima.length) return null;
  return (
    <div className="sticky top-0 z-10 border-b border-borda bg-surface/95 p-2 backdrop-blur">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-2">
        <CornerLeftUp size={14} className="shrink-0 text-accent-strong" />
        <span className="truncate">Tirar de {acima.at(-1)!.nome}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {acima
          .slice(0, -1)
          .reverse()
          .map((l) => (
            <AlvoSair key={l.id} id={l.id}>
              <Folder size={14} className="shrink-0" /> <span className="truncate">{l.nome}</span>
            </AlvoSair>
          ))}
        <AlvoSair id={null}>
          <Home size={14} className="shrink-0" /> Nível principal
        </AlvoSair>
      </div>
    </div>
  );
}

/** Alvo da faixa "Tirar de…": uma categoria de cima, ou null = nível principal. */
function AlvoSair({ id, children }: { id: string | null; children: ReactNode }) {
  const { sobre } = useArrastar();
  const { setNodeRef } = useDroppable({ id: id ? `sair:${id}` : `${RAIZ}-barra` });
  const ativo = sobre === (id ?? RAIZ);
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-2 text-sm font-semibold transition ${
        ativo ? 'border-accent bg-accent text-white' : 'border-accent/50 text-accent-strong'
      }`}
    >
      {children}
    </div>
  );
}

/** Ícone pequeno que abre todas as pastas (se estão todas fechadas) ou fecha todas. */
export function BotaoAbrirFecharTodas({ className = '' }: { className?: string }) {
  const { dados } = useDados();
  const { fechadas, setFechadas } = useArrastar();
  const pastas = dados.config.orcamento.filter((l) => temFilhas(dados.config, l.id)).map((l) => l.id);
  const todasFechadas = pastas.length > 0 && pastas.every((id) => fechadas.has(id));
  const rotulo = todasFechadas ? 'Abrir todas as pastas' : 'Fechar todas as pastas';
  const Icone = todasFechadas ? ChevronsUpDown : ChevronsDownUp;
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      onClick={() => setFechadas(() => (todasFechadas ? new Set() : new Set(pastas)))}
      className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink-2 max-lg:size-10 ${className}`}
    >
      <Icone size={15} />
    </button>
  );
}
