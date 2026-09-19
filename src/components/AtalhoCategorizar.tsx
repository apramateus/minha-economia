// Atalho discreto para "A categorizar": só aparece quando tem algo pendente.
import { ChevronRight, Inbox } from 'lucide-react';
import { useDados } from '../lib/estado';
import { aCategorizar } from '../lib/analise';

export function AtalhoCategorizar({ navegar, className = '' }: { navegar: (r: string) => void; className?: string }) {
  const { dados } = useDados();
  const n = aCategorizar(dados.config, dados.transacoes).reduce((s, g) => s + g.itens.length, 0);
  if (!n) return null;
  return (
    <button
      onClick={() => navegar('categorizar')}
      className={`flex w-full items-center gap-2 rounded-2xl border border-borda px-4 py-2.5 text-left text-sm text-ink-2 active:bg-surface-2 ${className}`}
    >
      <Inbox size={16} className="shrink-0 text-accent-strong" />
      <span className="flex-1">
        <strong className="text-ink">{n}</strong> {n === 1 ? 'gasto' : 'gastos'} a categorizar
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </button>
  );
}
