// Gráficos (Recharts) seguindo a skill de dataviz: marcas finas, grade discreta,
// texto sempre em tokens de texto, legenda para 2+ séries, tooltip em todo gráfico.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { nomeMesCurto } from '../lib/datas';
import { brl, brl0 } from '../lib/formato';

const SERIE_1 = 'var(--accent)';
const SERIE_2 = 'var(--series-2)';
const eixo = { fill: 'var(--muted)', fontSize: 11 };

const compacto = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v));

interface ItemTooltip {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function CaixaTooltip({ active, payload, label }: { active?: boolean; payload?: ItemTooltip[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-borda bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-muted">{nomeMesCurto(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />
          <span className="tabular font-semibold text-ink">{brl(Number(p.value))}</span>
          <span className="text-ink-2">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}

export interface PontoGastoMes {
  mes: string;
  planejado: number;
  naoPlanejado: number;
}

/** Colunas empilhadas: gasto em categorias planejadas × não planejado, com a linha do orçamento. */
export function GraficoGastosMeses({ dados, orcamento }: { dados: PontoGastoMes[]; orcamento: number }) {
  // topo múltiplo de 4 mil → marcas redondas a cada quarto (0, 2 mil, 4 mil…), sempre mostrando a linha do orçamento
  const maior = Math.max(orcamento, ...dados.map((d) => d.planejado + d.naoPlanejado));
  const topo = Math.ceil((maior * 1.05) / 4000) * 4000;
  return (
    <div>
      <Legenda
        itens={[
          { cor: SERIE_1, rotulo: 'Nas categorias do plano' },
          { cor: SERIE_2, rotulo: 'Não planejado' },
        ]}
      />
      <div className="h-52" role="img" aria-label="Gasto por mês, planejado e não planejado">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
            <XAxis dataKey="mes" tickFormatter={(m) => nomeMesCurto(m).slice(0, 3)} tick={eixo} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
            <YAxis
              tickFormatter={compacto}
              tick={eixo}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={[0, topo]}
              ticks={[0, topo / 4, topo / 2, (topo * 3) / 4, topo]}
            />
            <Tooltip content={<CaixaTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
            <ReferenceLine
              y={orcamento}
              stroke="var(--ink-2)"
              strokeWidth={1}
              label={{ value: `orçamento ${brl0(orcamento)}`, position: 'insideTopRight', fill: 'var(--ink-2)', fontSize: 11 }}
            />
            <Bar dataKey="planejado" name="Nas categorias do plano" stackId="g" fill={SERIE_1} barSize={22} isAnimationActive={false} />
            <Bar
              dataKey="naoPlanejado"
              name="Não planejado"
              stackId="g"
              fill={SERIE_2}
              barSize={22}
              radius={[4, 4, 0, 0]}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface PontoPatrimonio {
  mes: string;
  liquido: number;
}

/** Linha única do patrimônio líquido (sem legenda: o título do card diz o que é). */
export function GraficoPatrimonio({ dados }: { dados: PontoPatrimonio[] }) {
  const ultimo = dados.length - 1;
  return (
    <div className="h-48" role="img" aria-label="Patrimônio líquido por mês">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis dataKey="mes" tickFormatter={(m) => nomeMesCurto(m).slice(0, 3)} tick={eixo} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
          <YAxis tickFormatter={compacto} tick={eixo} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<CaixaTooltip />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="liquido"
            name="Patrimônio líquido"
            stroke={SERIE_1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === ultimo ? (
                <circle key="fim" cx={p.cx} cy={p.cy} r={5} fill={SERIE_1} stroke="var(--surface)" strokeWidth={2} />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 5, fill: SERIE_1, stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
