import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CircleHelp, X } from 'lucide-react';
import { nomeMesLongo, somarMeses } from '../lib/datas';
import { NATUREZAS } from '../lib/categorias';
import type { Natureza } from '../lib/tipos';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-borda bg-surface p-4 ${className}`}>{children}</section>;
}

export function TituloCard({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-ink-2">{children}</h2>
      {acao}
    </div>
  );
}

export function TituloPagina({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-4 px-1">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </header>
  );
}

/** Medidor: preenchimento carrega o estado (acento → alerta → estouro); trilho = mesmo tom, mais claro. */
export function Medidor({ valor, total, tom }: { valor: number; total: number; tom?: 'accent' | 'good' }) {
  const pct = total > 0 ? valor / total : valor > 0 ? 2 : 0;
  const cor =
    pct > 1 ? 'var(--critical)' : pct > 0.85 ? 'var(--warning)' : tom === 'good' ? 'var(--good)' : 'var(--accent)';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: `color-mix(in srgb, ${cor} 18%, transparent)` }}
      role="meter"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct * 100)}%`, background: cor }} />
    </div>
  );
}

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-accent text-white active:opacity-80',
  secundario: 'bg-surface-2 text-ink active:opacity-70',
  fantasma: 'text-accent-strong active:bg-surface-2',
  perigo: 'bg-critical text-white active:opacity-80',
};

export function Botao({
  children,
  onClick,
  variante = 'primario',
  className = '',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: Variante;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-40 ${VARIANTES[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Botão que pede um segundo clique para confirmar (sem pop-ups do navegador). */
export function BotaoConfirmar({
  children,
  confirmar = 'Confirmar?',
  onConfirmar,
  variante = 'perigo',
  className = '',
}: {
  children: ReactNode;
  confirmar?: string;
  onConfirmar: () => void;
  variante?: Variante;
  className?: string;
}) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 3000);
    return () => clearTimeout(t);
  }, [armado]);
  return (
    <Botao
      variante={armado ? variante : 'secundario'}
      className={className}
      onClick={() => (armado ? (setArmado(false), onConfirmar()) : setArmado(true))}
    >
      {armado ? confirmar : children}
    </Botao>
  );
}

/** Folha que sobe de baixo (celular) / modal centralizado (Mac). */
export function Folha({
  aberta,
  titulo,
  onFechar,
  children,
  semCabecalho,
}: {
  aberta: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  /** o conteúdo traz o próprio título (ex.: nome editável) */
  semCabecalho?: boolean;
}) {
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
    };
  }, [aberta, onFechar]);
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 pb-safe shadow-2xl sm:rounded-3xl">
        {!semCabecalho && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{titulo}</h2>
            <button onClick={onFechar} className="-mr-2 rounded-full p-2 text-muted active:bg-surface-2" aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="pb-4">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold text-ink-2">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-muted">{dica}</span>}
    </label>
  );
}

export const classeInput =
  'w-full rounded-xl border border-borda bg-page px-3 py-2.5 text-ink outline-none focus:border-accent';

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${classeInput} ${props.className ?? ''}`} />;
}

export function Seletor(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${classeInput} ${props.className ?? ''}`} />;
}

export function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition max-lg:py-2 ${
        ativo ? 'border-accent bg-accent text-white' : 'border-borda bg-surface text-ink active:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

export function Alternador<T extends string>({
  opcoes,
  valor,
  onMudar,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onMudar: (v: T) => void;
}) {
  return (
    <div className="mb-4 flex rounded-xl bg-surface-2 p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            valor === o.valor ? 'bg-surface text-ink shadow-sm' : 'text-muted'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function SeletorMes({ mes, onMudar, className = '' }: { mes: string; onMudar: (m: string) => void; className?: string }) {
  return (
    <div className={`mb-4 flex items-center justify-between rounded-2xl border border-borda bg-surface px-2 py-1.5 ${className}`}>
      <button className="rounded-full p-2 active:bg-surface-2" onClick={() => onMudar(somarMeses(mes, -1))} aria-label="Mês anterior">
        <ChevronLeft size={20} />
      </button>
      <span className="font-semibold first-letter:uppercase">{nomeMesLongo(mes)}</span>
      <button className="rounded-full p-2 active:bg-surface-2" onClick={() => onMudar(somarMeses(mes, 1))} aria-label="Próximo mês">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

export function Stat({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted">{rotulo}</div>
      <div className="mt-0.5 text-xl font-semibold">{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-muted">{detalhe}</div>}
    </div>
  );
}

/** Explicação que só aparece quando pedida: um (?) que mostra o texto ao passar o mouse ou ao clicar. */
export function Ajuda({ children, rotulo = 'O que é isso?' }: { children: ReactNode; rotulo?: string }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(280, window.innerWidth - 16);
    setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - 8 - w)), top: r.bottom + 6 });
  };
  useEffect(() => {
    if (!pos) return;
    const esconder = () => setPos(null);
    window.addEventListener('scroll', esconder, true);
    return () => window.removeEventListener('scroll', esconder, true);
  }, [pos]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={rotulo}
        onMouseEnter={mostrar}
        onMouseLeave={() => setPos(null)}
        onBlur={() => setPos(null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          pos ? setPos(null) : mostrar();
        }}
        className="inline-flex shrink-0 rounded-full align-middle text-muted hover:text-ink-2 pointer-coarse:-m-2 pointer-coarse:p-2"
      >
        <CircleHelp size={14} />
      </button>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[80] rounded-lg bg-ink px-3 py-2 text-xs leading-snug text-page shadow-lg"
            style={{ left: pos.left, top: pos.top, width: Math.min(280, window.innerWidth - 16) }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

const TELA_GRANDE = '(min-width: 1024px)';

/** Tela de computador (≥ 1024 px, o `lg` do Tailwind): menu lateral, lista e detalhe lado a lado. */
export function useComputador(): boolean {
  const [grande, setGrande] = useState(() => typeof window !== 'undefined' && window.matchMedia(TELA_GRANDE).matches);
  useEffect(() => {
    const m = window.matchMedia(TELA_GRANDE);
    const mudou = () => setGrande(m.matches);
    m.addEventListener('change', mudou);
    return () => m.removeEventListener('change', mudou);
  }, []);
  return grande;
}

const ALTURAS: Record<Natureza, number[]> = { fixo: [6, 6, 6], flexivel: [4, 9, 6], pontual: [1.5, 10, 1.5] };

/**
 * O sinal de cada comportamento (Fixo/Flexível/Pontual) — não é cor, que já diz o ramo: três barrinhas como três meses de gasto.
 * Fixo = iguais; Flexível = variam; Pontual = um mês só.
 */
export function IconeComportamento({ natureza, size = 14, className = '' }: { natureza: Natureza; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className={`shrink-0 ${className}`}>
      {ALTURAS[natureza].map((h, i) => (
        <rect key={i} x={0.75 + i * 4} y={11 - h} width={2.5} height={h} rx={0.8} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Etiqueta do comportamento da categoria. Só aparece com "Mostrar comportamento" ligado (`useMostrarTipo`). */
export function EtiquetaTipo({ natureza }: { natureza: Natureza }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted">
      <IconeComportamento natureza={natureza} size={10} />
      {NATUREZAS.find((n) => n.id === natureza)?.nome ?? natureza}
    </span>
  );
}

const CHAVE_MOSTRAR_TIPO = 'categorias.mostrarTipo';

/** Mostrar a etiqueta do comportamento nas listas de categorias (Gastos → Pastas e Custo para viver): desligado por padrão, lembrado. */
export function useMostrarTipo(): [boolean, (v: boolean) => void] {
  const [ligado, setLigado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MOSTRAR_TIPO) === '1';
    } catch {
      return false;
    }
  });
  const mudar = (v: boolean) => {
    setLigado(v);
    try {
      localStorage.setItem(CHAVE_MOSTRAR_TIPO, v ? '1' : '0');
    } catch {
      /* navegação privada: vale só agora */
    }
  };
  return [ligado, mudar];
}
