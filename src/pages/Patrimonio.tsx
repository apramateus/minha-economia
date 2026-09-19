// "Ver mais" do card de patrimônio do Início: contas e investimentos e bens (editáveis); as dívidas têm aba própria.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useDados } from '../lib/estado';
import { brl, brl0, lerValor, valorParaCampo } from '../lib/formato';
import { novoId } from '../lib/id';
import { r2, resumoPatrimonio } from '../lib/calculos';
import type { Conta, Item, Patrimonio as TPatrimonio } from '../lib/tipos';
import { Ajuda, Botao, BotaoConfirmar, Card, Campo, Entrada, Folha, TituloCard, TituloPagina } from '../components/ui';

type Secao = 'contas' | 'bens';
type Edicao = { secao: Secao; item: Conta | Item | null };

export function Patrimonio({ navegar, secao }: { navegar: (r: string) => void; secao?: string | null }) {
  const { dados } = useDados();
  const p = dados.patrimonio;
  const res = resumoPatrimonio(p);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const bens = useRef<HTMLDivElement>(null);
  // "Com os bens" do Início abre direto na lista de bens
  useEffect(() => {
    if (secao === 'bens') bens.current?.scrollIntoView({ block: 'start' });
  }, [secao]);

  return (
    <div className="space-y-3">
      <button
        onClick={() => navegar('painel')}
        className="-mb-1 flex items-center gap-0.5 px-1 text-sm font-semibold text-accent-strong max-lg:-mb-3.5 max-lg:-mt-2.5 max-lg:py-2.5"
      >
        <ChevronLeft size={16} /> Início
      </button>
      <TituloPagina>Patrimônio</TituloPagina>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted">Patrimônio líquido</div>
            <div className={`tabular text-2xl font-bold tracking-tight ${res.liquido < 0 ? 'text-critical' : ''}`}>{brl0(res.liquido)}</div>
            <div className="text-xs text-muted">
              {brl0(res.contas)} − {brl0(res.dividas)} de dívidas
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Com os bens</div>
            <div className="tabular text-2xl font-bold tracking-tight">{brl0(res.total)}</div>
            <div className="text-xs text-muted">+ {brl0(res.bens)} em bens</div>
          </div>
        </div>
      </Card>

      <Lista
        titulo="Contas e investimentos"
        itens={p.contas}
        extra={(c) => ((c as Conta).reserva ? 'reserva' : undefined)}
        onEditar={(item) => setEdicao({ secao: 'contas', item })}
      />
      <button onClick={() => navegar('dividas')} className="block w-full text-left">
        <Card className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink-2">Dívidas</span>
          <span className="flex items-center gap-1">
            <span className="tabular text-sm font-semibold">{brl0(res.dividas)}</span>
            <ChevronRight size={18} className="text-muted" />
          </span>
        </Card>
      </button>
      <div ref={bens} className="scroll-mt-4">
        <Lista titulo="Bens (valor de revenda)" itens={p.bens} onEditar={(item) => setEdicao({ secao: 'bens', item })} />
      </div>

      {edicao && <FolhaItem edicao={edicao} onFechar={() => setEdicao(null)} />}
    </div>
  );
}

function Lista<T extends Item | Conta>({
  titulo,
  itens,
  onEditar,
  extra,
  acao,
}: {
  titulo: string;
  itens: T[];
  onEditar: (i: T | null) => void;
  extra?: (i: T) => string | undefined;
  acao?: (i: T) => React.ReactNode;
}) {
  const total = r2(itens.reduce((s, i) => s + ('saldo' in i ? i.saldo : i.valor), 0));
  return (
    <Card>
      <TituloCard acao={<span className="tabular text-xs text-muted">{brl0(total)}</span>}>{titulo}</TituloCard>
      <ul className="divide-y divide-borda">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-2">
            <button className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 text-left" onClick={() => onEditar(i)}>
              <span className="min-w-0">
                <span className="block truncate text-sm">{i.nome}</span>
                {(extra?.(i) || i.nota) && <span className="block truncate text-xs text-muted">{extra?.(i) ?? i.nota}</span>}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">{brl('saldo' in i ? i.saldo : i.valor)}</span>
            </button>
            {acao?.(i)}
          </li>
        ))}
      </ul>
      <button className="mt-2 flex items-center gap-1 text-sm font-semibold text-accent-strong max-lg:mt-0 max-lg:min-h-10" onClick={() => onEditar(null)}>
        <Plus size={16} /> Adicionar
      </button>
    </Card>
  );
}

const NOMES_SECAO: Record<Secao, string> = { contas: 'conta', bens: 'bem' };

function FolhaItem({ edicao, onFechar }: { edicao: Edicao; onFechar: () => void }) {
  const { atualizar, aviso } = useDados();
  const { secao, item } = edicao;
  const ehConta = secao === 'contas';
  const valorAtual = item ? ('saldo' in item ? item.saldo : item.valor) : undefined;
  const [nome, setNome] = useState(item?.nome ?? '');
  const [valor, setValor] = useState(valorParaCampo(valorAtual));
  const [nota, setNota] = useState(item?.nota ?? '');
  const [reserva, setReserva] = useState(item && 'reserva' in item ? item.reserva : false);
  const v = lerValor(valor);

  const salvar = async () => {
    if (!nome.trim() || v === null) return;
    const base = { id: item?.id ?? novoId(), nome: nome.trim(), ...(nota.trim() ? { nota: nota.trim() } : {}) };
    const novo = ehConta ? { ...base, saldo: v, reserva } : { ...base, valor: v };
    await atualizar('patrimonio', (p) => {
      const lista = p[secao] as (Conta | Item)[];
      return {
        ...p,
        [secao]: item ? lista.map((x) => (x.id === item.id ? novo : x)) : [...lista, novo],
      } as TPatrimonio;
    });
    aviso('Salvo');
    onFechar();
  };

  const excluir = async () => {
    if (!item) return;
    await atualizar('patrimonio', (p) => ({ ...p, [secao]: (p[secao] as { id: string }[]).filter((x) => x.id !== item.id) }) as TPatrimonio);
    onFechar();
  };

  return (
    <Folha aberta titulo={`${item ? 'Editar' : 'Adicionar'} ${NOMES_SECAO[secao]}`} onFechar={onFechar}>
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo={ehConta ? 'Saldo hoje (R$)' : 'Valor (R$)'}>
        <Entrada autoFocus={!!item} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      {ehConta && (
        <label className="mb-3 flex items-center gap-2 text-sm max-lg:min-h-10">
          <input type="checkbox" className="max-lg:size-5" checked={reserva} onChange={(e) => setReserva(e.target.checked)} />
          É reserva
          <Ajuda>Dinheiro guardado: o saldo das reservas enche as metas, em ordem.</Ajuda>
        </label>
      )}
      <Campo rotulo="Nota">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="opcional" />
      </Campo>
      <Botao className="w-full py-3" disabled={!nome.trim() || v === null} onClick={salvar}>
        Salvar
      </Botao>
      {item && (
        <BotaoConfirmar className="mt-2 w-full" confirmar="Confirmar remoção" onConfirmar={excluir}>
          Remover
        </BotaoConfirmar>
      )}
    </Folha>
  );
}
