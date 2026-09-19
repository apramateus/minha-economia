import { RefreshCw } from 'lucide-react';
import { tempoDesde, useBanco } from '../lib/banco';

/** Linha "Banco conectado · atualizado há X" com botão de atualizar. Some se o banco não estiver configurado. */
export function BarraBanco({ className = '' }: { className?: string }) {
  const { configurado, sincronizando, sincronizadoEm, sincronizar } = useBanco();
  if (!configurado) return null;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-2xl border border-borda bg-surface px-4 py-2.5 text-sm ${className}`}>
      <span className="flex items-center gap-2 text-ink-2">
        <span className="size-2 rounded-full bg-good" aria-hidden />
        Banco conectado · {sincronizando ? 'atualizando…' : `atualizado ${tempoDesde(sincronizadoEm)}`}
      </span>
      <button
        onClick={() => sincronizar()}
        disabled={sincronizando}
        className="-mr-2 flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-accent-strong active:bg-surface-2 disabled:opacity-50 max-lg:-my-2.5 max-lg:p-3"
        aria-label="Atualizar com o banco"
      >
        {/* no celular, só o ícone: com a palavra, a linha não cabe */}
        <RefreshCw size={15} className={sincronizando ? 'animate-spin' : ''} /> <span className="max-lg:hidden">Atualizar</span>
      </button>
    </div>
  );
}
