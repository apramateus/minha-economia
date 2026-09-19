// Início, na ordem que o usuário pediu: patrimônio, meses de liberdade, metas (3 primeiras), mês até agora, a categorizar.
// No computador, em duas colunas para caber na tela sem rolar.
import { Check, ChevronRight, Inbox, Smartphone } from 'lucide-react';
import { useDados } from '../lib/estado';
import { isoMes, nomeMesCurto } from '../lib/datas';
import { brl0, num } from '../lib/formato';
import { aportePlanejado, cascataMetas, custoReal, resumoMes, resumoPatrimonio, ritmoAporte, runway, type EtapaCascata } from '../lib/calculos';
import { aCategorizar } from '../lib/analise';
import { temExemplo } from '../lib/exemplo';
import { Ajuda, Card, Medidor, TituloCard } from '../components/ui';

const METAS_NO_INICIO = 3;
/** marcos no caminho até a meta de patrimônio (só aparece para quem definiu `config.metaPatrimonio`) */
const MARCOS = [0, 10_000, 25_000];

export function Painel({ navegar }: { navegar: (rota: string) => void }) {
  const { dados } = useDados();
  const { config, transacoes } = dados;
  const mes = isoMes();

  const r = resumoMes(config, transacoes, mes);
  const pat = resumoPatrimonio(dados.patrimonio);
  const real = custoReal(config, transacoes, mes);
  const custo = real.valor;
  const rw = runway(pat.liquido, custo);
  const ritmo = ritmoAporte(dados.metas, mes, aportePlanejado(config));
  const etapas = cascataMetas(dados.metas, pat.reserva, pat.emprestimos, custo, ritmo.valor, mes);
  const pendentes = aCategorizar(config, transacoes);
  const nPendentes = pendentes.reduce((s, g) => s + g.itens.length, 0);
  const totalPendente = pendentes.reduce((s, g) => s + g.total, 0);
  const hojeExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const exemplo = temExemplo(transacoes, dados.patrimonio);

  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between px-1 pb-1">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="first-letter:uppercase">{hojeExtenso}</span>
            {/* instalação nova: números de exemplo até o banco ser conectado */}
            {exemplo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-text">
                Exemplo <Ajuda>Números de exemplo. Somem quando o banco for conectado.</Ajuda>
              </span>
            )}
          </p>
          <h1 className="text-2xl font-bold tracking-tight lg:hidden">Minha Economia</h1>
        </div>
        {/* o QR para abrir no iPhone só faz sentido no computador */}
        <button
          onClick={() => navegar('celular')}
          className="mt-1 flex items-center gap-1 rounded-full border border-borda px-3 py-1.5 text-xs font-semibold text-accent-strong active:bg-surface-2 max-lg:hidden"
          aria-label="Abrir no celular"
        >
          <Smartphone size={14} /> Celular
        </button>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          {/* 1. Patrimônio */}
          <Card>
            <TituloCard
              acao={
                <button onClick={() => navegar('patrimonio')} className="flex items-center text-sm font-semibold text-accent-strong max-lg:-my-2.5 max-lg:py-2.5">
                  Ver mais <ChevronRight size={15} />
                </button>
              }
            >
              Patrimônio líquido
            </TituloCard>
            <div className={`tabular -mt-1 text-4xl font-bold tracking-tight ${pat.liquido < 0 ? 'text-critical' : ''}`}>{brl0(pat.liquido)}</div>
            <div className="mt-1 text-sm text-muted">
              Banco e investimentos {brl0(pat.contas)} − dívidas {brl0(pat.dividas)}
            </div>
            {config.metaPatrimonio ? <MetaPatrimonio liquido={pat.liquido} meta={config.metaPatrimonio} /> : null}
            {/* abre a lista de bens (Patrimônio), onde eles são editados */}
            <div className="mt-3 border-t border-borda pt-2">
              <button
                onClick={() => navegar('patrimonio?secao=bens')}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded-lg px-2 py-1 text-left hover:bg-surface-2 max-lg:min-h-10"
              >
                <span className="text-sm text-ink-2">Com os bens</span>
                <span className="flex items-center gap-1">
                  <span className="tabular text-lg font-semibold">{brl0(pat.total)}</span>
                  <ChevronRight size={16} className="text-muted" />
                </span>
              </button>
            </div>
          </Card>

          {/* 2. Meses de liberdade */}
          <Card>
            <TituloCard>
              <span className="flex items-center gap-1">
                Meses de liberdade
                <Ajuda>Quantos meses o patrimônio líquido paga o custo real (o que saiu no mês passado; pontuais pela média do plano), sem salário.</Ajuda>
              </span>
            </TituloCard>
            <div className="text-3xl font-bold">{num(rw)}</div>
            <div className="mt-2">
              <Medidor valor={rw} total={config.saida.runwayMeses} tom="good" />
            </div>
            <div className="mt-1 text-xs text-muted">
              {pat.liquido > 0 ? (
                <>
                  {brl0(pat.liquido)} líquidos ÷ {brl0(custo)} de custo {real.fonte === 'real' ? `real em ${nomeMesCurto(real.meses[0]).slice(0, 3)}` : 'do plano'}
                </>
              ) : (
                <>patrimônio líquido negativo</>
              )}{' '}
              · meta: {config.saida.runwayMeses} meses
            </div>
          </Card>
        </div>

        {/* 3. Metas */}
        <Card className="flex flex-col">
          <TituloCard
            acao={
              <button onClick={() => navegar('metas')} className="flex items-center text-sm font-semibold text-accent-strong max-lg:-my-2.5 max-lg:py-2.5">
                {etapas.length > METAS_NO_INICIO ? `Ver mais (${etapas.length - METAS_NO_INICIO})` : 'Abrir'} <ChevronRight size={15} />
              </button>
            }
          >
            Metas
          </TituloCard>
          {etapas.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma meta ainda.</p>
          ) : (
            <ol className="space-y-4">
              {etapas.slice(0, METAS_NO_INICIO).map((e, i) => (
                <LinhaMeta key={e.id} etapa={e} ordem={i + 1} />
              ))}
            </ol>
          )}
          <div className="mt-auto flex items-center gap-1 pt-3 text-xs text-muted">
            Ritmo {brl0(ritmo.valor)}/mês · {ritmo.fonte === 'real' ? 'média real' : 'sobra do plano'}
            <Ajuda>A média do que você guardou nos últimos 3 meses; sem histórico, a sobra do plano (renda fixa − plano do mês).</Ajuda>
          </div>
        </Card>

        {/* 4. Mês até agora */}
        <Card>
          <TituloCard>Mês até agora</TituloCard>
          <Medidor valor={r.gasto} total={r.planejado} />
          <div className="mt-2 flex justify-between text-sm">
            <span className="tabular">
              {brl0(r.gasto)} <span className="text-muted">gastos de {brl0(r.planejado)}</span>
            </span>
            <button className="text-sm font-semibold text-accent-strong max-lg:-my-2.5 max-lg:py-2.5" onClick={() => navegar('orcamento')}>
              Orçamento
            </button>
          </div>
          <div className="mt-1 text-xs text-muted">
            Entrou {brl0(r.receita)} de {brl0(r.receitaEsperada)} da renda fixa
            {r.naoPlanejado > 0 && <> · {brl0(r.naoPlanejado)} não planejado</>}
          </div>
        </Card>

        {/* 5. Gastos a categorizar */}
        <button className="block w-full text-left" onClick={() => navegar('categorizar')} disabled={!nPendentes}>
          <Card className="flex h-full items-center gap-3">
            {nPendentes ? <Inbox size={20} className="shrink-0 text-accent-strong" /> : <Check size={20} className="shrink-0 text-good" />}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{nPendentes ? `${nPendentes} gastos a categorizar` : 'Nada a categorizar'}</span>
              {nPendentes > 0 && <span className="tabular block text-sm text-ink-2">{brl0(totalPendente)}</span>}
            </span>
            {nPendentes > 0 && <ChevronRight size={18} className="shrink-0 text-muted" />}
          </Card>
        </button>
      </div>
    </div>
  );
}

/** A meta de patrimônio líquido como um jogo: a barra até a meta, os marcos no caminho e o próximo a bater. */
function MetaPatrimonio({ liquido, meta }: { liquido: number; meta: number }) {
  const marcos = MARCOS.filter((m) => m < meta);
  const proximo = [...marcos, meta].find((m) => liquido < m);
  const pct = Math.max(0, Math.min(1, liquido / meta));
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-ink-2">Meta {brl0(meta)}</span>
        <span className="tabular text-muted">{Math.floor(pct * 100)}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-good/15" role="meter" aria-valuenow={Math.floor(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-good transition-all" style={{ width: `${pct * 100}%` }} />
        {marcos
          .filter((m) => m > 0)
          .map((m) => (
            <span
              key={m}
              title={brl0(m)}
              className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${liquido >= m ? 'bg-good' : 'bg-surface-2'}`}
              style={{ left: `${(m / meta) * 100}%` }}
            />
          ))}
      </div>
      <div className="mt-1.5 text-xs text-muted">
        {proximo === undefined
          ? 'Meta batida'
          : proximo === 0
            ? `Próximo marco: sair do negativo · faltam ${brl0(-liquido)}`
            : `Próximo marco: ${brl0(proximo)} · faltam ${brl0(proximo - liquido)}`}
      </div>
    </div>
  );
}

function LinhaMeta({ etapa: e, ordem }: { etapa: EtapaCascata; ordem: number }) {
  const divida = e.id === '_emprestimo';
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              e.completa ? 'bg-good text-white' : e.atual ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
            }`}
          >
            {e.completa ? <Check size={11} strokeWidth={3} /> : ordem}
          </span>
          <span className="truncate">{e.nome}</span>
        </span>
        <span className="shrink-0 text-xs text-ink-2">{e.completa ? 'completa' : e.previsao ? nomeMesCurto(e.previsao) : 'sem previsão'}</span>
      </div>
      <Medidor valor={divida ? 0 : e.saldo} total={e.alvo} tom="good" />
      <div className="tabular mt-1 text-xs text-muted">
        {divida ? `falta pagar ${brl0(e.alvo)}` : `${brl0(e.saldo)} de ${brl0(e.alvo)}`}
      </div>
    </li>
  );
}
