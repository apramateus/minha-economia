import { RefreshCw } from 'lucide-react';
import { tempoDesde, useBanco } from '../lib/banco';
import { atrasada, quando } from '../lib/sincronizacao';
import { Ajuda } from './ui';

/**
 * De quando são os dados de cada conexão com o banco (o Meu Pluggy busca 1× por dia, no horário dele — não é quando o
 * app buscou). Sem botão de atualizar: o app busca sozinho logo depois do horário da Pluggy (pedido do usuário), e
 * buscar antes não traz nada. Some se o banco não estiver configurado.
 */
export function BarraBanco({ className = '' }: { className?: string }) {
  const { configurado, sincronizando, sincronizadoEm, conexoes } = useBanco();
  if (!configurado) return null;
  const agora = Date.now();
  const proximas = conexoes
    .filter((c) => c.proximaEm && Date.parse(c.proximaEm) > agora)
    .sort((a, b) => Date.parse(a.proximaEm!) - Date.parse(b.proximaEm!));
  return (
    <div className={`flex items-center justify-between gap-2 rounded-2xl border border-borda bg-surface px-4 py-2.5 text-sm ${className}`}>
      {conexoes.length ? (
        <ul className="min-w-0 space-y-0.5 lg:flex lg:gap-6 lg:space-y-0">
          {conexoes.map((c) => (
            <li key={c.nome} className="flex min-w-0 items-center gap-2 text-ink-2">
              <span className={`size-2 shrink-0 rounded-full ${atrasada(c, agora) ? 'bg-warning' : 'bg-good'}`} aria-hidden />
              <span className="truncate">{c.nome}</span>
              <span className="tabular shrink-0 text-muted">· dados de {quando(c.atualizadoEm, agora)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full bg-good" aria-hidden />
          Banco conectado · atualizado {tempoDesde(sincronizadoEm)}
        </span>
      )}
      <span className="flex shrink-0 items-center gap-1">
        {proximas.length > 0 && (
          <Ajuda>
            O banco manda os dados uma vez por dia; o app busca sozinho logo depois. Próximos:{' '}
            {proximas.map((c) => `${c.nome} ${quando(c.proximaEm, agora)}`).join(' · ')}.
          </Ajuda>
        )}
        {/* buscando sozinho agora */}
        {sincronizando && <RefreshCw size={14} className="animate-spin text-muted" aria-label="Buscando no banco" />}
      </span>
    </div>
  );
}
