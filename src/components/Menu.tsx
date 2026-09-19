// Menu flutuante com submenus: no mouse, os submenus abrem ao passar por cima (em cascata); no toque, um toque
// desce um nível (com Voltar) e, no celular, o menu é uma folha embaixo. Usado pelo botão direito (categorias,
// lançamentos) e pelo seletor de categoria. No toque, o botão direito é segurar o dedo (`useToqueLongo`).
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { filhas, temFilhas, descendentes } from '../lib/categorias';
import type { Config } from '../lib/tipos';

const LARGURA = 248;
const porNome = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export interface ItemMenu {
  id: string;
  rotulo: string;
  icone?: ReactNode;
  /** texto discreto à direita (ex.: "em geral") */
  dica?: string;
  /** é o escolhido (✓) */
  marcado?: boolean;
  /** o escolhido está dentro deste */
  realce?: boolean;
  negrito?: boolean;
  perigo?: boolean;
  /** linha divisória abaixo */
  separador?: boolean;
  /** linha divisória acima */
  separadorAntes?: boolean;
  desativado?: boolean;
  onEscolher?: () => void;
  submenu?: () => ItemMenu[];
}

export interface Ancora {
  x: number;
  y: number;
  /** borda esquerda do que abriu (para abrir para a esquerda quando não cabe à direita) */
  xEsquerda: number;
}

export const ancoraAbaixo = (el: HTMLElement): Ancora => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 6, xEsquerda: r.left };
};
const ancoraAoLado = (el: HTMLElement): Ancora => {
  const r = el.getBoundingClientRect();
  return { x: r.right + 4, y: r.top - 6, xEsquerda: r.left - 4 };
};
const noPonto = (x: number, y: number): Ancora => ({ x, y, xEsquerda: x });

// ---------- Toque: segurar o dedo = botão direito ----------

/** O último ponteiro usado (o `useToqueLongo` acompanha): um menu aberto pelo dedo abre no modo de toque. */
let ultimoPonteiro: 'mouse' | 'toque' = 'mouse';
export const veioDoToque = () => ultimoPonteiro === 'toque';
const SEGURAR_MS = 500;
const TOLERANCIA_PX = 10;
/** Segurar o dedo aqui não abre menu (ex.: a alça de arrastar). */
export const SEM_TOQUE_LONGO = 'data-sem-toque-longo';

/**
 * O Safari do iPhone não tem botão direito nem dispara `contextmenu` ao segurar o dedo. Segurar ~0,5 s sem mexer
 * dispara um `contextmenu` no lugar tocado: todo `onContextMenu` do app passa a valer no toque. Se abriu um menu,
 * soltar o dedo não vira clique. No Android o navegador já dispara o dele: vale o primeiro, o outro é ignorado.
 */
export function useToqueLongo() {
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    let inicio = { x: 0, y: 0 };
    let tocando = false;
    let abriu = false;
    let disparadoEm = 0;
    const cancelar = () => {
      clearTimeout(espera);
      espera = undefined;
    };
    const ponteiro = (e: PointerEvent) => (ultimoPonteiro = e.pointerType === 'mouse' ? 'mouse' : 'toque');
    const comecar = (e: TouchEvent) => {
      cancelar();
      tocando = true;
      abriu = false;
      const alvo = e.target as Element;
      if (e.touches.length !== 1 || alvo.closest?.(`input, textarea, select, [contenteditable], [${SEM_TOQUE_LONGO}]`)) return;
      const t = e.touches[0];
      inicio = { x: t.clientX, y: t.clientY };
      espera = setTimeout(() => {
        espera = undefined;
        disparadoEm = Date.now();
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: inicio.x, clientY: inicio.y, button: 2 });
        alvo.dispatchEvent(ev);
        abriu = ev.defaultPrevented; // quem abre menu chama preventDefault
        if (abriu) navigator.vibrate?.(10);
      }, SEGURAR_MS);
    };
    const mexer = (e: TouchEvent) => {
      const t = e.touches[0];
      if (espera && t && Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > TOLERANCIA_PX) cancelar();
    };
    const soltar = (e: TouchEvent) => {
      cancelar();
      tocando = false;
      if (abriu && e.cancelable) e.preventDefault(); // o menu abriu: soltar não clica no que estava embaixo
      abriu = false;
    };
    const nativo = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      if (tocando && espera) cancelar(); // o navegador disparou o dele antes (Android): fica o dele
      else if (Date.now() - disparadoEm < 1500) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const fim = () => {
      cancelar();
      tocando = false;
    };
    document.addEventListener('pointerdown', ponteiro, true);
    document.addEventListener('touchstart', comecar, { capture: true, passive: true });
    document.addEventListener('touchmove', mexer, { capture: true, passive: true });
    document.addEventListener('touchend', soltar, { capture: true, passive: false });
    document.addEventListener('touchcancel', fim, true);
    document.addEventListener('contextmenu', nativo, true);
    window.addEventListener('scroll', fim, true);
    return () => {
      cancelar();
      document.removeEventListener('pointerdown', ponteiro, true);
      document.removeEventListener('touchstart', comecar, true);
      document.removeEventListener('touchmove', mexer, true);
      document.removeEventListener('touchend', soltar, true);
      document.removeEventListener('touchcancel', fim, true);
      document.removeEventListener('contextmenu', nativo, true);
      window.removeEventListener('scroll', fim, true);
    };
  }, []);
}

/** No celular, o menu do toque vira uma folha embaixo da tela. */
const emFolha = (modo: 'mouse' | 'toque') => modo === 'toque' && window.innerWidth < 1024;

export function MenuFlutuante({
  itens,
  ancora,
  modo = 'mouse',
  titulo,
  onFechar,
  onPointerEnter,
  onPointerLeave,
  ignorar,
}: {
  itens: ItemMenu[];
  ancora: Ancora;
  modo?: 'mouse' | 'toque';
  titulo?: string;
  onFechar: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  /** clicar aqui não conta como "fora" (ex.: o botão que abriu) */
  ignorar?: RefObject<HTMLElement | null>;
}) {
  const [cadeia, setCadeia] = useState<{ itens: ItemMenu[]; ancora: Ancora; aberta: string | null }[]>([{ itens, ancora, aberta: null }]);
  const [pilha, setPilha] = useState<{ itens: ItemMenu[]; titulo: string }[]>([{ itens, titulo: titulo ?? '' }]);
  const ref = useRef<HTMLDivElement>(null);
  // troca de submenu com um instante de atraso: ir na diagonal até o submenu não fecha ele no caminho
  const troca = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarTroca = () => {
    if (troca.current) clearTimeout(troca.current);
    troca.current = null;
  };

  useEffect(() => {
    setCadeia([{ itens, ancora, aberta: null }]);
    setPilha([{ itens, titulo: titulo ?? '' }]);
  }, [itens, ancora, titulo]);

  useEffect(() => {
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || ignorar?.current?.contains(alvo)) return;
      onFechar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onFechar();
    };
    const rolou = (e: Event) => !ref.current?.contains(e.target as Node) && onFechar();
    document.addEventListener('pointerdown', fora, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', onFechar);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', onFechar);
      cancelarTroca();
    };
  }, [onFechar, ignorar]);

  const escolher = (i: ItemMenu) => {
    if (i.desativado || !i.onEscolher) return;
    i.onEscolher();
    onFechar();
  };

  return createPortal(
    <div ref={ref} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onContextMenu={(e) => e.preventDefault()}>
      {modo === 'mouse' ? (
        cadeia.map((nivel, i) => (
          <Painel
            key={i}
            itens={nivel.itens}
            ancora={nivel.ancora}
            aberta={nivel.aberta}
            onEntrarNoPainel={cancelarTroca}
            onPassar={(item, el) => {
              const aplicar = () =>
                setCadeia((c) => {
                  const ate = c.slice(0, i + 1).map((n, j) => (j === i ? { ...n, aberta: item.submenu ? item.id : null } : n));
                  return item.submenu && !item.desativado ? [...ate, { itens: item.submenu(), ancora: ancoraAoLado(el), aberta: null }] : ate;
                });
              cancelarTroca();
              // sem submenu aberto nesse nível, abre na hora; com um aberto, espera um pouco
              if (cadeia.length <= i + 1) aplicar();
              else troca.current = setTimeout(aplicar, 160);
            }}
            onClicar={escolher}
          />
        ))
      ) : (
        <Painel
          folha={emFolha(modo)}
          onFora={onFechar}
          itens={pilha.at(-1)!.itens}
          ancora={ancora}
          aberta={null}
          voltar={pilha.length > 1 ? { nome: pilha.at(-2)!.titulo || 'Voltar', acao: () => setPilha((p) => p.slice(0, -1)) } : undefined}
          onClicar={(item) => (item.submenu && !item.desativado ? setPilha((p) => [...p, { itens: item.submenu!(), titulo: item.rotulo }]) : escolher(item))}
        />
      )}
    </div>,
    document.body,
  );
}

function Painel({
  itens,
  ancora,
  aberta,
  voltar,
  folha,
  onFora,
  onPassar,
  onEntrarNoPainel,
  onClicar,
}: {
  itens: ItemMenu[];
  ancora: Ancora;
  aberta: string | null;
  voltar?: { nome: string; acao: () => void };
  /** folha embaixo da tela (celular), em vez de flutuar onde abriu */
  folha?: boolean;
  onFora?: () => void;
  onPassar?: (i: ItemMenu, el: HTMLElement) => void;
  onEntrarNoPainel?: () => void;
  onClicar: (i: ItemMenu) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: ancora.x, top: ancora.y });
  // cabe na tela: vira para a esquerda / sobe quando precisa
  useEffect(() => {
    const el = ref.current;
    if (!el || folha) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(LARGURA, vw - 16);
    let left = ancora.x;
    if (left + w > vw - 8) left = ancora.xEsquerda > w + 8 && ancora.x !== ancora.xEsquerda ? ancora.xEsquerda - w : vw - 8 - w;
    const top = Math.max(8, Math.min(ancora.y, vh - 8 - el.offsetHeight));
    setPos({ left: Math.max(8, left), top });
  }, [ancora, itens.length, folha]);

  const linha = `flex w-full items-center text-left ${folha ? 'min-h-12 gap-3 px-5 text-base' : 'gap-2 px-3 py-2 text-sm'}`;
  const painel = (
    <div
      ref={ref}
      role="menu"
      onPointerEnter={onEntrarNoPainel}
      className={
        folha
          ? 'fixed inset-x-0 bottom-0 z-[60] max-h-[75dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl'
          : 'fixed z-[60] max-h-[min(70vh,480px)] overflow-y-auto rounded-xl border border-borda bg-surface py-1 shadow-2xl'
      }
      style={folha ? undefined : { left: pos.left, top: pos.top, width: Math.min(LARGURA, window.innerWidth - 16) }}
    >
      {voltar && (
        <button type="button" onClick={voltar.acao} className={`${linha} border-b border-borda font-semibold text-accent-strong`}>
          <ChevronLeft size={15} /> {voltar.nome}
        </button>
      )}
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          role="menuitem"
          disabled={i.desativado}
          aria-haspopup={i.submenu ? 'menu' : undefined}
          aria-expanded={i.submenu ? aberta === i.id : undefined}
          onPointerEnter={(e) => e.pointerType === 'mouse' && onPassar?.(i, e.currentTarget)}
          onClick={() => onClicar(i)}
          className={`${linha} ${i.separador ? 'border-b border-borda' : ''} ${i.separadorAntes ? 'border-t border-borda' : ''} ${
            i.desativado
              ? 'opacity-40'
              : i.marcado
                ? 'bg-accent text-white'
                : aberta === i.id
                  ? 'bg-surface-2'
                  : i.realce
                    ? 'bg-accent-weak/60'
                    : 'hover:bg-surface-2 active:bg-surface-2'
          } ${i.perigo && !i.marcado ? 'text-critical' : ''}`}
        >
          {i.icone && <span className={`flex w-4 shrink-0 justify-center ${i.marcado || i.perigo ? '' : 'text-muted'}`}>{i.icone}</span>}
          <span className={`min-w-0 flex-1 truncate ${i.negrito ? 'font-semibold' : ''}`}>{i.rotulo}</span>
          {i.dica && <span className={`shrink-0 text-xs ${i.marcado ? 'text-white/80' : 'text-muted'}`}>{i.dica}</span>}
          {i.marcado && !i.submenu && !i.dica && <Check size={14} className="shrink-0" />}
          {i.submenu && <ChevronRight size={15} className={`shrink-0 ${i.marcado ? '' : 'text-muted'}`} />}
        </button>
      ))}
    </div>
  );
  if (!folha) return painel;
  // fundo escuro: tocar fora fecha (no clique, e não no toque, para o toque não cair no que está embaixo)
  return (
    <>
      <div className="fixed inset-0 z-[59] bg-black/40" onClick={onFora} />
      {painel}
    </>
  );
}

/** Botão direito: `abrir(e, itens)` no onContextMenu; renderize `menu` em qualquer lugar. */
export function useMenuContexto() {
  const [aberto, setAberto] = useState<{ itens: ItemMenu[]; ancora: Ancora; modo: 'mouse' | 'toque' } | null>(null);
  const fechar = useCallback(() => setAberto(null), []);
  const abrir = useCallback((e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation?: () => void }, itens: ItemMenu[]) => {
    e.preventDefault();
    e.stopPropagation?.();
    setAberto({ itens, ancora: noPonto(e.clientX, e.clientY), modo: veioDoToque() ? 'toque' : 'mouse' });
  }, []);
  const menu = aberto ? <MenuFlutuante itens={aberto.itens} ancora={aberto.ancora} modo={aberto.modo} onFechar={fechar} /> : null;
  return { abrir, fechar, menu, aberto: !!aberto };
}

/**
 * As categorias como itens de menu, em árvore: cada uma com outras dentro abre um submenu que começa com
 * "Nome · em geral". Em ordem alfabética. `valor` marca a escolhida (e realça as de cima dela).
 * `sem` deixa de fora uma categoria e as de dentro dela (ex.: mover uma categoria para dentro de outra).
 */
export function itensDeCategorias(
  c: Config,
  valor: string | null | undefined,
  onEscolher: (id: string) => void,
  pai: string | null = null,
  sem?: string,
): ItemMenu[] {
  const dentro = (id: string) => !!valor && valor !== id && descendentes(c, id).has(valor);
  const deFora = (l: { id: string }) => l.id !== sem;
  return filhas(c, pai)
    .filter(deFora)
    .sort((a, b) => porNome.compare(a.nome, b.nome))
    .map((l) =>
      temFilhas(c, l.id) && filhas(c, l.id).some(deFora)
        ? {
            id: l.id,
            rotulo: l.nome,
            marcado: valor === l.id,
            realce: dentro(l.id),
            onEscolher: () => onEscolher(l.id),
            submenu: () => [emGeral(c, l.id, valor, onEscolher), ...itensDeCategorias(c, valor, onEscolher, l.id, sem)],
          }
        : { id: l.id, rotulo: l.nome, marcado: valor === l.id, onEscolher: () => onEscolher(l.id) },
    );
}

/** Primeira linha do submenu de uma categoria: escolher ela mesma, em geral. */
export function emGeral(c: Config, id: string, valor: string | null | undefined, onEscolher: (id: string) => void): ItemMenu {
  const l = c.orcamento.find((x) => x.id === id);
  return { id: `${id}#geral`, rotulo: l?.nome ?? '', dica: 'em geral', negrito: true, separador: true, marcado: valor === id, onEscolher: () => onEscolher(id) };
}
