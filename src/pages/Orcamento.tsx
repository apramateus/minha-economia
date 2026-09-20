// Orçamento: só os números do plano (renda fixa, custo para viver, sobra, renda média, histórico).
// O plano de cada categoria fica em Custo para viver (#/custo); as categorias, na aba Gastos.
import { useState } from 'react';
import { AlertTriangle, ChevronRight, FolderTree, Plus, ReceiptText, X } from 'lucide-react';
import { useDados } from '../lib/estado';
import { nomeMesCurto, somarMeses } from '../lib/datas';
import { brl0, lerValor, valorParaCampo } from '../lib/formato';
import {
  custoEssencial,
  custoReal,
  r2,
  rendaFixaMensal,
  rendaMedia,
  resumoMes,
  sobraPlanejada,
  type RendaMedia,
} from '../lib/calculos';
import { novoId } from '../lib/id';
import { GraficoGastosMeses } from '../components/graficos';
import { Ajuda, Botao, Card, Entrada, Folha, Medidor, SeletorMes, TituloCard, TituloPagina } from '../components/ui';

export function Orcamento({ mes, setMes, navegar }: { mes: string; setMes: (m: string) => void; navegar: (r: string) => void }) {
  const { dados } = useDados();
  const { config, transacoes } = dados;
  const [rendaAberta, setRendaAberta] = useState(false);
  const real = custoReal(config, transacoes);
  const sobra = sobraPlanejada(config);

  const r = resumoMes(config, transacoes, mes);
  const historico = Array.from({ length: 6 }, (_, i) => somarMeses(mes, i - 5)).map((m) => {
    const x = resumoMes(config, transacoes, m);
    return { mes: m, planejado: Math.max(0, x.gasto - x.naoPlanejado), naoPlanejado: x.naoPlanejado };
  });
  const media3 = rendaMedia(transacoes, 3);
  const media12 = rendaMedia(transacoes, 12);

  return (
    <div className="space-y-3">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-4">
        <TituloPagina>Orçamento</TituloPagina>
        <SeletorMes mes={mes} onMudar={setMes} className="lg:w-80" />
      </div>

      {/* no computador, duas colunas para caber sem rolar: o plano à esquerda, o mês escolhido à direita */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3">
          <button className="group block w-full text-left" onClick={() => navegar('custo')}>
            <Card className="transition group-hover:border-accent">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold">
                  <ReceiptText size={18} className="text-accent" /> Custo para viver
                </span>
                <ChevronRight size={18} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-strong" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted">Plano</div>
                  <div className="tabular text-xl font-semibold">
                    {brl0(custoEssencial(config))}
                    <span className="text-sm font-normal text-muted">/mês</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">{real.fonte === 'real' ? `Real (${nomeMesCurto(real.meses[0]).slice(0, 3)})` : 'Real'}</div>
                  <div className="tabular text-xl font-semibold">{real.fonte === 'real' ? brl0(real.valor) : '—'}</div>
                </div>
              </div>
            </Card>
          </button>

          <Card>
            <div className="grid grid-cols-2 gap-4">
              <button className="text-left" onClick={() => setRendaAberta(true)}>
                <div className="flex items-center gap-0.5 text-xs text-muted">
                  Renda fixa <ChevronRight size={12} />
                </div>
                <div className="text-lg font-semibold">{brl0(rendaFixaMensal(config))}</div>
                {config.rendaFixa.length > 0 && <div className="truncate text-xs text-muted">{config.rendaFixa.map((f) => f.nome).join(' + ')}</div>}
              </button>
              <div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  Sobra para as metas <Ajuda>Renda fixa − plano do custo para viver.</Ajuda>
                </div>
                <div className={`text-lg font-semibold ${sobra < 0 ? 'text-critical' : 'text-good-text'}`}>{brl0(sobra)}/mês</div>
              </div>
            </div>
          </Card>

          <Card>
            <TituloCard>
              <span className="flex items-center gap-1">
                Renda média
                <Ajuda>O que entrou de verdade nas contas conectadas (salário e qualquer outra entrada), por mês, em meses completos.</Ajuda>
              </span>
            </TituloCard>
            <div className="grid grid-cols-2 gap-4">
              <StatRenda rotulo="Últimos 3 meses" media={media3} n={3} />
              <StatRenda rotulo="Último ano" media={media12} n={12} />
            </div>
          </Card>
        </div>

        <div className="space-y-3 lg:row-span-2">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted">Gasto no mês</div>
                <div className="text-xl font-semibold">
                  {brl0(r.gasto)} <span className="text-sm font-normal text-muted">de {brl0(r.planejado)}</span>
                </div>
              </div>
              <button className="text-right" onClick={() => navegar('extrato?filtro=nao')}>
                <div className="flex items-center justify-end gap-1 text-xs text-muted">
                  {r.naoPlanejado > 0 && <AlertTriangle size={12} className="text-warning" />} Não planejado
                </div>
                <div className="text-xl font-semibold">{brl0(r.naoPlanejado)}</div>
              </button>
            </div>
            <div className="mt-3">
              <Medidor valor={r.gasto} total={r.planejado} />
            </div>
          </Card>

          <Card>
            <TituloCard>Gasto nos últimos 6 meses</TituloCard>
            {historico.some((h) => h.planejado + h.naoPlanejado > 0) ? (
              <GraficoGastosMeses dados={historico} orcamento={custoEssencial(config)} />
            ) : (
              <p className="text-sm text-muted">Sem gastos ainda.</p>
            )}
          </Card>
        </div>

        <button className="block w-full text-left" onClick={() => navegar('gastos')}>
          <Card className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold">
              <FolderTree size={18} className="text-accent" /> Categorias
            </span>
            <ChevronRight size={18} className="text-muted" />
          </Card>
        </button>
      </div>

      {rendaAberta && <FolhaRendaFixa onFechar={() => setRendaAberta(false)} />}
    </div>
  );
}

function StatRenda({ rotulo, media, n }: { rotulo: string; media: RendaMedia; n: number }) {
  const { meses } = media;
  return (
    <div>
      <div className="text-xs text-muted">{rotulo}</div>
      <div className="text-lg font-semibold">{meses.length ? brl0(media.valor) : '—'}</div>
      <div className="text-xs text-muted">
        {!meses.length
          ? 'sem dados ainda'
          : meses.length < n
            ? `só ${meses.length} ${meses.length === 1 ? 'mês' : 'meses'} de dados (${nomeMesCurto(meses[0]).slice(0, 3)}–${nomeMesCurto(meses.at(-1)!).slice(0, 3)})`
            : `${nomeMesCurto(meses[0]).slice(0, 3)} a ${nomeMesCurto(meses.at(-1)!).slice(0, 3)}`}
      </div>
    </div>
  );
}

/** O que você conta receber todo mês (ex.: Salário R$ 5.000). Pode ter mais de uma fonte. */
function FolhaRendaFixa({ onFechar }: { onFechar: () => void }) {
  const { dados, atualizar, aviso } = useDados();
  const [itens, setItens] = useState(() => dados.config.rendaFixa.map((f) => ({ ...f, campo: valorParaCampo(f.valor) })));
  const validos = itens.every((f) => f.nome.trim() && lerValor(f.campo) !== null);
  const total = r2(itens.reduce((s, f) => s + (lerValor(f.campo) ?? 0), 0));
  const mudar = (i: number, x: Partial<(typeof itens)[number]>) => setItens(itens.map((f, j) => (j === i ? { ...f, ...x } : f)));

  const salvar = async () => {
    const rendaFixa = itens.map((f) => ({ id: f.id, nome: f.nome.trim(), valor: lerValor(f.campo)! }));
    await atualizar('config', (c) => ({ ...c, rendaFixa }));
    aviso('Renda fixa atualizada');
    onFechar();
  };

  return (
    <Folha aberta titulo="Renda fixa" onFechar={onFechar}>
      <ul className="mb-3 space-y-2">
        {itens.map((f, i) => (
          <li key={f.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Entrada value={f.nome} onChange={(e) => mudar(i, { nome: e.target.value })} placeholder="De onde" aria-label="De onde" />
            </div>
            <div className="w-28 shrink-0">
              <Entrada
                inputMode="decimal"
                value={f.campo}
                onChange={(e) => mudar(i, { campo: e.target.value })}
                placeholder="R$/mês"
                aria-label={`Valor por mês de ${f.nome || 'renda'}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setItens(itens.filter((_, j) => j !== i))}
              className="rounded-full p-2 text-muted active:bg-surface-2 max-lg:-mr-1 max-lg:p-3"
              aria-label={`Remover ${f.nome || 'renda'}`}
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mb-4 flex items-center gap-1 text-sm font-semibold text-accent-strong max-lg:mb-2 max-lg:min-h-10"
        onClick={() => setItens([...itens, { id: novoId(), nome: '', valor: 0, campo: '' }])}
      >
        <Plus size={16} /> Adicionar
      </button>
      <div className="mb-3 flex justify-between text-sm">
        <span className="flex items-center gap-1 text-ink-2">
          Total por mês <Ajuda>O que você conta receber todo mês. É a base do plano: sobra e metas.</Ajuda>
        </span>
        <span className="tabular font-semibold">{brl0(total)}</span>
      </div>
      <Botao className="w-full py-3" disabled={!validos} onClick={salvar}>
        Salvar
      </Botao>
    </Folha>
  );
}
