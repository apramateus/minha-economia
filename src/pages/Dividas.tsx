// Aba Dívidas: o que você deve. A fatura do cartão vem do banco (só aparece); as outras você registra aqui.
import { useState } from 'react';
import { ChevronLeft, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDados } from '../lib/estado';
import { brl, brl0, lerValor, valorParaCampo } from '../lib/formato';
import { novoId } from '../lib/id';
import { r2, resumoPatrimonio } from '../lib/calculos';
import type { Divida } from '../lib/tipos';
import { Botao, Card, Campo, Entrada, Folha, Seletor, TituloPagina } from '../components/ui';
import { useMenuContexto, type ItemMenu } from '../components/Menu';

/** a fatura do cartão: a sincronização com o banco cria e atualiza; o app não edita nem exclui */
const doBanco = (d: Divida) => d.tipo === 'fatura';
const NOME_TIPO: Partial<Record<Divida['tipo'], string>> = { emprestimo: 'Empréstimo' };

export function Dividas({ navegar }: { navegar: (r: string) => void }) {
  const { dados } = useDados();
  const dividas = dados.patrimonio.dividas;
  const total = resumoPatrimonio(dados.patrimonio).dividas;
  const [editar, setEditar] = useState<Divida | 'nova' | null>(null);
  const excluir = useExcluirDivida();
  const menu = useMenuContexto();

  const itensDaDivida = (d: Divida): ItemMenu[] => [
    { id: 'editar', rotulo: 'Editar…', icone: <Pencil size={15} />, separador: true, onEscolher: () => setEditar(d) },
    { id: 'excluir', rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onEscolher: () => excluir(d) },
  ];

  return (
    <div className="space-y-3">
      {/* no celular Dívidas não está na barra de baixo: chega pelo Patrimônio */}
      <button
        onClick={() => navegar('patrimonio')}
        className="-mb-3.5 -mt-2.5 flex items-center gap-0.5 px-1 py-2.5 text-sm font-semibold text-accent-strong lg:hidden"
      >
        <ChevronLeft size={16} /> Patrimônio
      </button>
      <TituloPagina>Dívidas</TituloPagina>

      <Card>
        <div className="text-xs text-muted">Total devido</div>
        <div className="tabular text-2xl font-bold tracking-tight">{brl0(total)}</div>
      </Card>

      {dividas.length > 0 && (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-borda">
            {dividas.map((d) => {
              const detalhe = [NOME_TIPO[d.tipo], d.nota].filter(Boolean).join(' · ');
              const conteudo = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{d.nome}</span>
                      {doBanco(d) && (
                        <span title="Vem do banco" aria-label="Vem do banco" className="shrink-0 text-muted">
                          <Landmark size={13} />
                        </span>
                      )}
                    </span>
                    {detalhe && <span className="block truncate text-xs text-muted">{detalhe}</span>}
                  </span>
                  <span className="tabular shrink-0 font-semibold">{brl(d.valor)}</span>
                </>
              );
              return (
                <li key={d.id}>
                  {doBanco(d) ? (
                    <div className="flex items-center gap-3 px-4 py-3 text-sm">{conteudo}</div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-2/50"
                      onClick={() => setEditar(d)}
                      onContextMenu={(e) => menu.abrir(e, itensDaDivida(d))}
                    >
                      {conteudo}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <button className="flex items-center gap-1 px-1 text-sm font-semibold text-accent-strong max-lg:min-h-10" onClick={() => setEditar('nova')}>
        <Plus size={16} /> Adicionar
      </button>

      {editar && <FolhaDivida divida={editar === 'nova' ? null : editar} onFechar={() => setEditar(null)} />}
      {menu.menu}
    </div>
  );
}

/** Excluir age na hora, com Desfazer no aviso (volta para o mesmo lugar da lista). */
function useExcluirDivida() {
  const { dados, atualizar, aviso } = useDados();
  return async (divida: Divida) => {
    const i = dados.patrimonio.dividas.findIndex((x) => x.id === divida.id);
    if (i < 0) return;
    const original = dados.patrimonio.dividas[i];
    await atualizar('patrimonio', (p) => ({ ...p, dividas: p.dividas.filter((x) => x.id !== original.id) }));
    aviso(`“${original.nome}” excluída`, 'ok', {
      rotulo: 'Desfazer',
      fazer: () =>
        atualizar('patrimonio', (p) =>
          p.dividas.some((x) => x.id === original.id) ? p : { ...p, dividas: [...p.dividas.slice(0, i), original, ...p.dividas.slice(i)] },
        ),
    });
  };
}

function FolhaDivida({ divida, onFechar }: { divida: Divida | null; onFechar: () => void }) {
  const { atualizar, aviso } = useDados();
  const excluir = useExcluirDivida();
  const [nome, setNome] = useState(divida?.nome ?? '');
  const [valor, setValor] = useState(valorParaCampo(divida?.valor));
  const [tipo, setTipo] = useState<Divida['tipo']>(divida?.tipo ?? 'emprestimo');
  const [nota, setNota] = useState(divida?.nota ?? '');
  const v = lerValor(valor);
  const valido = !!nome.trim() && v !== null && v > 0;

  const salvar = async () => {
    if (!nome.trim() || v === null || v <= 0) return;
    const nova: Divida = {
      id: divida?.id ?? novoId(),
      nome: nome.trim(),
      valor: r2(v),
      tipo,
      ...(nota.trim() ? { nota: nota.trim() } : {}),
    };
    await atualizar('patrimonio', (p) => ({
      ...p,
      dividas: divida ? p.dividas.map((x) => (x.id === divida.id ? nova : x)) : [...p.dividas, nova],
    }));
    aviso('Dívida salva');
    onFechar();
  };

  return (
    <Folha aberta titulo={divida ? 'Editar dívida' : 'Nova dívida'} onFechar={onFechar}>
      <Campo rotulo="Nome">
        <Entrada autoFocus={!divida} value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="Falta pagar (R$)">
        <Entrada autoFocus={!!divida} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo rotulo="Tipo">
        <Seletor value={tipo} onChange={(e) => setTipo(e.target.value as Divida['tipo'])}>
          <option value="emprestimo">Empréstimo</option>
          <option value="outra">Outra</option>
        </Seletor>
      </Campo>
      <Campo rotulo="Nota">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="opcional" />
      </Campo>
      <Botao className="w-full py-3" disabled={!valido} onClick={salvar}>
        Salvar
      </Botao>
      {divida && (
        <button
          type="button"
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-critical active:bg-surface-2"
          onClick={() => {
            onFechar();
            excluir(divida);
          }}
        >
          <Trash2 size={15} /> Excluir dívida
        </button>
      )}
    </Folha>
  );
}
