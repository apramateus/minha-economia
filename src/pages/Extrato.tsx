import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, FileUp } from 'lucide-react';
import { useDados } from '../lib/estado';
import { dataCurta, deIsoDia } from '../lib/datas';
import { brl } from '../lib/formato';
import { doMes, linhaPorId, naoPlanejada, r2 } from '../lib/calculos';
import type { Transacao } from '../lib/tipos';
import { FONTES } from '../lib/contas';
import { Botao, Card, Chip, SeletorMes, Seletor, TituloPagina } from '../components/ui';
import { BarraBanco } from '../components/BarraBanco';
import { AtalhoCategorizar } from '../components/AtalhoCategorizar';
import { rotuloArvore, useMenuDoLancamento } from '../components/AcoesCategoria';
import { useMenuContexto } from '../components/Menu';
import { descendentes, listaEmArvore } from '../lib/categorias';

type Filtro = 'todos' | 'gastos' | 'entradas' | 'nao' | 'transf';

export function Extrato({
  mes,
  setMes,
  filtroInicial,
  editar,
  importar,
  navegar,
}: {
  mes: string;
  setMes: (m: string) => void;
  filtroInicial?: string;
  editar: (t: Transacao) => void;
  importar: () => void;
  navegar: (r: string) => void;
}) {
  const { dados } = useDados();
  const { config } = dados;
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [linha, setLinha] = useState('');
  const menu = useMenuContexto();
  const itensDoLancamento = useMenuDoLancamento(editar);

  useEffect(() => {
    if (filtroInicial && ['todos', 'gastos', 'entradas', 'nao', 'transf'].includes(filtroInicial)) setFiltro(filtroInicial as Filtro);
  }, [filtroInicial]);

  // filtrar por uma categoria inclui as que estão dentro dela
  const dentroDaLinha = linha ? descendentes(config, linha) : new Set<string>();
  const doM = doMes(dados.transacoes, mes);
  const lista = doM
    .filter((t) => {
      if (filtro === 'gastos' && t.tipo !== 'despesa') return false;
      if (filtro === 'entradas' && t.tipo !== 'receita') return false;
      if (filtro === 'nao' && !naoPlanejada(config, t)) return false;
      if (filtro === 'transf' && t.tipo !== 'transferencia') return false;
      if (linha && !(t.linha && dentroDaLinha.has(t.linha))) return false;
      return true;
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  const entradas = r2(doM.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0));
  const saidas = r2(doM.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0));
  const somaLista = r2(lista.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0));

  const porDia = new Map<string, Transacao[]>();
  for (const t of lista) porDia.set(t.data, [...(porDia.get(t.data) ?? []), t]);

  return (
    <div>
      <TituloPagina>Extrato</TituloPagina>
      <BarraBanco className="mb-3" />
      <SeletorMes mes={mes} onMudar={setMes} />
      <AtalhoCategorizar navegar={navegar} className="mb-3" />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-muted">Entrou</div>
          <div className="tabular text-lg font-semibold text-good-text">{brl(entradas)}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Saiu (gastos)</div>
          <div className="tabular text-lg font-semibold">{brl(saidas)}</div>
        </Card>
      </div>

      {/* no celular, as pílulas rolam de lado até a borda da tela (a página não) */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 max-lg:-mx-4 max-lg:px-4">
        {(
          [
            ['todos', 'Tudo'],
            ['gastos', 'Gastos'],
            ['nao', 'Não planejado'],
            ['entradas', 'Entradas'],
            ['transf', 'Transferências'],
          ] as [Filtro, string][]
        ).map(([f, r]) => (
          <Chip key={f} ativo={filtro === f} onClick={() => setFiltro(f)}>
            {r}
          </Chip>
        ))}
      </div>
      <div className="mb-3 flex gap-2">
        <Seletor value={linha} onChange={(e) => setLinha(e.target.value)} className="flex-1 py-2 text-sm max-lg:min-w-0">
          <option value="">Todas as categorias</option>
          {listaEmArvore(config)
            .filter((p) => p.id)
            .map((p) => (
              <option key={p.id} value={p.id!}>
                {rotuloArvore(p)}
              </option>
            ))}
        </Seletor>
        <Botao variante="secundario" onClick={importar}>
          <FileUp size={16} /> Importar
        </Botao>
      </div>

      {(filtro !== 'todos' || linha) && lista.length > 0 && (
        <p className="mb-2 px-1 text-sm text-ink-2">
          {lista.length} lançamentos · {brl(somaLista)} em gastos
        </p>
      )}

      {lista.length === 0 ? (
        <Card className="text-center text-sm text-muted">Nenhum lançamento.</Card>
      ) : (
        <div className="space-y-3">
          {[...porDia].map(([dia, ts]) => (
            <section key={dia}>
              <h3 className="mb-1 px-1 text-xs font-semibold text-muted first-letter:uppercase">
                {deIsoDia(dia).toLocaleDateString('pt-BR', { weekday: 'short' })} · {dataCurta(dia)}
              </h3>
              <Card className="p-0">
                <ul className="divide-y divide-borda">
                  {ts.map((t) => {
                    const l = linhaPorId(config, t.linha);
                    const np = naoPlanejada(config, t);
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => editar(t)}
                          onContextMenu={(e) => menu.abrir(e, itensDoLancamento(t))}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{t.descricao}</div>
                            {(t.dataBanco || t.valorBanco !== undefined) && (
                              <div className="text-xs text-muted">
                                No banco: {[t.dataBanco && dataCurta(t.dataBanco), t.valorBanco !== undefined && brl(t.valorBanco)].filter(Boolean).join(' · ')}
                              </div>
                            )}
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                              {t.tipo === 'transferencia' ? (
                                <>
                                  <ArrowLeftRight size={12} /> Transferência
                                </>
                              ) : t.tipo === 'receita' ? (
                                <>Entrada · {FONTES.find((f) => f.valor === t.fonte)?.rotulo ?? 'Outros'}</>
                              ) : np ? (
                                <span className="inline-flex items-center gap-1 text-warning-text">
                                  <AlertTriangle size={12} /> Não planejado
                                </span>
                              ) : (
                                l?.nome
                              )}
                            </div>
                          </div>
                          <span
                            className={`tabular shrink-0 text-sm font-semibold ${
                              t.tipo === 'receita' ? 'text-good-text' : t.tipo === 'transferencia' ? 'text-muted' : ''
                            }`}
                          >
                            {t.tipo === 'receita' || (t.tipo === 'despesa' && t.valor < 0) ? '+' : t.tipo === 'despesa' ? '−' : ''}
                            {brl(Math.abs(t.valor))}
                            {t.tipo === 'despesa' && t.valor < 0 ? ' (estorno)' : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
      {menu.menu}
    </div>
  );
}
