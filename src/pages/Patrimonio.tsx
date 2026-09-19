// "Ver mais" do card de patrimônio do Início. Contas e investimentos vêm do banco (só aparecem); os bens (o que não dá para
// registrar sozinho, em geral coisa física) a pessoa edita aqui. As dívidas têm aba própria.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDados } from '../lib/estado';
import { brl, brl0, lerValor, valorParaCampo } from '../lib/formato';
import { novoId } from '../lib/id';
import { r2, resumoPatrimonio } from '../lib/calculos';
import type { Item } from '../lib/tipos';
import { Ajuda, Botao, Card, Campo, Entrada, Folha, TituloCard, TituloPagina } from '../components/ui';
import { useMenuContexto, type ItemMenu } from '../components/Menu';

type AbrirMenu = ReturnType<typeof useMenuContexto>['abrir'];

export function Patrimonio({ navegar, secao }: { navegar: (r: string) => void; secao?: string | null }) {
  const { dados } = useDados();
  const p = dados.patrimonio;
  const res = resumoPatrimonio(p);
  const [editar, setEditar] = useState<Item | 'novo' | null>(null);
  const excluir = useExcluirBem();
  const menu = useMenuContexto();
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

      <Card>
        <TituloCard acao={<span className="tabular text-xs text-muted">{brl0(res.contas)}</span>}>
          <span className="flex items-center gap-1">
            Contas e investimentos
            <Ajuda>Vêm do banco e se atualizam sozinhas.</Ajuda>
          </span>
        </TituloCard>
        <ul className="divide-y divide-borda">
          {p.contas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm">{c.nome}</span>
                {(c.reserva || c.nota) && <span className="block truncate text-xs text-muted">{c.reserva ? 'reserva' : c.nota}</span>}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">{brl(c.saldo)}</span>
            </li>
          ))}
        </ul>
      </Card>
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
        <ListaBens itens={p.bens} total={res.bens} onEditar={setEditar} onExcluir={excluir} onMenu={menu.abrir} />
      </div>

      {editar && <FolhaBem bem={editar === 'novo' ? null : editar} onFechar={() => setEditar(null)} />}
      {menu.menu}
    </div>
  );
}

/** Bens (o que não vem do banco, em geral coisa física): clicar edita; botão direito ou ⋯ → Editar/Excluir. */
function ListaBens({
  itens,
  total,
  onEditar,
  onExcluir,
  onMenu,
}: {
  itens: Item[];
  total: number;
  onEditar: (b: Item | 'novo') => void;
  onExcluir: (b: Item) => void;
  onMenu: AbrirMenu;
}) {
  const itensDoMenu = (b: Item): ItemMenu[] => [
    { id: 'editar', rotulo: 'Editar…', icone: <Pencil size={15} />, separador: true, onEscolher: () => onEditar(b) },
    { id: 'excluir', rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onEscolher: () => onExcluir(b) },
  ];
  return (
    <Card>
      <TituloCard acao={<span className="tabular text-xs text-muted">{brl0(total)}</span>}>Bens (valor de revenda)</TituloCard>
      <ul className="divide-y divide-borda">
        {itens.map((b) => (
          <li key={b.id} className="group flex items-center gap-2" onContextMenu={(e) => onMenu(e, itensDoMenu(b))}>
            <button className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 text-left" onClick={() => onEditar(b)}>
              <span className="min-w-0">
                <span className="block truncate text-sm">{b.nome}</span>
                {b.nota && <span className="block truncate text-xs text-muted">{b.nota}</span>}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">{brl(b.valor)}</span>
            </button>
            <button
              type="button"
              aria-label="Opções"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onMenu({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {} }, itensDoMenu(b));
              }}
              className="-mr-1.5 shrink-0 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink-2 max-lg:p-2.5 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
            >
              <Ellipsis size={18} />
            </button>
          </li>
        ))}
      </ul>
      <button className="mt-2 flex items-center gap-1 text-sm font-semibold text-accent-strong max-lg:mt-0 max-lg:min-h-10" onClick={() => onEditar('novo')}>
        <Plus size={16} /> Adicionar
      </button>
    </Card>
  );
}

/** Excluir age na hora, com Desfazer no aviso (volta para o mesmo lugar da lista). */
function useExcluirBem() {
  const { dados, atualizar, aviso } = useDados();
  return async (bem: Item) => {
    const i = dados.patrimonio.bens.findIndex((x) => x.id === bem.id);
    if (i < 0) return;
    const original = dados.patrimonio.bens[i];
    await atualizar('patrimonio', (p) => ({ ...p, bens: p.bens.filter((x) => x.id !== original.id) }));
    aviso(`“${original.nome}” excluído`, 'ok', {
      rotulo: 'Desfazer',
      fazer: () =>
        atualizar('patrimonio', (p) =>
          p.bens.some((x) => x.id === original.id) ? p : { ...p, bens: [...p.bens.slice(0, i), original, ...p.bens.slice(i)] },
        ),
    });
  };
}

function FolhaBem({ bem, onFechar }: { bem: Item | null; onFechar: () => void }) {
  const { atualizar, aviso } = useDados();
  const excluir = useExcluirBem();
  const [nome, setNome] = useState(bem?.nome ?? '');
  const [valor, setValor] = useState(valorParaCampo(bem?.valor));
  const [nota, setNota] = useState(bem?.nota ?? '');
  const v = lerValor(valor);
  const valido = !!nome.trim() && v !== null && v >= 0;

  const salvar = async () => {
    if (!valido) return;
    const novo: Item = { id: bem?.id ?? novoId(), nome: nome.trim(), valor: r2(v!), ...(nota.trim() ? { nota: nota.trim() } : {}) };
    await atualizar('patrimonio', (p) => ({ ...p, bens: bem ? p.bens.map((x) => (x.id === bem.id ? novo : x)) : [...p.bens, novo] }));
    aviso('Bem salvo');
    onFechar();
  };

  return (
    <Folha aberta titulo={bem ? 'Editar bem' : 'Novo bem'} onFechar={onFechar}>
      <Campo rotulo="Nome">
        <Entrada autoFocus={!bem} value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && salvar()} />
      </Campo>
      <Campo rotulo="Valor de revenda (R$)">
        <Entrada autoFocus={!!bem} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && salvar()} />
      </Campo>
      <Campo rotulo="Nota">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="opcional" />
      </Campo>
      <Botao className="w-full py-3" disabled={!valido} onClick={salvar}>
        Salvar
      </Botao>
      {bem && (
        <button
          type="button"
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-critical active:bg-surface-2"
          onClick={() => {
            onFechar();
            excluir(bem);
          }}
        >
          <Trash2 size={15} /> Excluir
        </button>
      )}
    </Folha>
  );
}
