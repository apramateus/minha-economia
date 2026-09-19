// Gastos que vieram do banco sem categoria e que ninguém olhou ainda, agrupados por estabelecimento:
// os do mês atual em destaque; os de antes recolhidos embaixo.
// Tocar abre a folha de editar; o botão direito muda a categoria (no grupo, de todos de uma vez).
// Descartar (✕, botão direito, "Descartar todos" nos meses de antes) tira da fila sem categoria: o gasto continua no
// Não planejado do mês dele (aparece em Gastos quando o período inclui aquele mês).
import { useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronRight, FolderInput, TriangleAlert, X } from 'lucide-react';
import { useDados } from '../lib/estado';
import { dataCurta, isoMes, nomeMesLongo } from '../lib/datas';
import { brl, brl0 } from '../lib/formato';
import { aCategorizar, type GrupoACategorizar } from '../lib/analise';
import type { Transacao } from '../lib/tipos';
import { Card, TituloPagina } from '../components/ui';
import { itensDeCategorias, useMenuContexto, type ItemMenu } from '../components/Menu';
import { useMenuDoLancamento, useOperacoesCategorias } from '../components/AcoesCategoria';

const contagem = (grupos: GrupoACategorizar[]) => {
  const n = grupos.reduce((s, g) => s + g.itens.length, 0);
  return { n, texto: `${n} lançamento${n === 1 ? '' : 's'}`, total: grupos.reduce((s, g) => s + g.total, 0) };
};

export function Categorizar({ editar, navegar }: { editar: (t: Transacao) => void; navegar: (r: string) => void }) {
  const { dados, atualizar, aviso } = useDados();
  const { recategorizar } = useOperacoesCategorias();
  const menu = useMenuContexto();
  const itensDoLancamento = useMenuDoLancamento(editar);
  const mes = isoMes();
  // o que foi movido para um mês à frente (ex.: aluguel pago antes) fica junto com o do mês
  const doMes = aCategorizar(dados.config, dados.transacoes.filter((t) => t.data.slice(0, 7) >= mes));
  const antes = aCategorizar(dados.config, dados.transacoes.filter((t) => t.data.slice(0, 7) < mes));
  const [verAntes, setVerAntes] = useState(false);
  const nomeMes = nomeMesLongo(mes);
  const soMes = nomeMes.split(' ')[0];
  const cMes = contagem(doMes);
  const cAntes = contagem(antes);

  /** Tira da fila sem categoria (`editado`, como o não planejado que o usuário já conhece), com Desfazer. */
  const descartar = async (itens: Transacao[]) => {
    const ids = new Set(itens.map((t) => t.id));
    const trocar = (sim: boolean) =>
      atualizar('transacoes', (ts) => ts.map((t) => (ids.has(t.id) ? { ...t, editado: sim || undefined } : t)));
    await trocar(true);
    aviso(`${ids.size === 1 ? '1 gasto descartado' : `${ids.size} gastos descartados`} · ficam no Não planejado`, 'ok', {
      rotulo: 'Desfazer',
      fazer: () => trocar(false),
    });
  };
  const itemDescartar = (itens: Transacao[]): ItemMenu => ({
    id: 'descartar',
    rotulo: 'Descartar',
    icone: <X size={15} />,
    separadorAntes: true,
    onEscolher: () => descartar(itens),
  });

  /** Botão direito no cabeçalho de um grupo: a categoria vale para todos os lançamentos dele. */
  const itensDoGrupo = (itens: Transacao[]): ItemMenu[] => {
    const ids = itens.map((t) => t.id);
    return [
      {
        id: 'categoria',
        rotulo: 'Categoria',
        icone: <FolderInput size={15} />,
        submenu: () => [
          {
            id: '_nao',
            rotulo: 'Não planejado',
            icone: <TriangleAlert size={14} />,
            separador: true,
            marcado: itens.every((t) => !dados.config.orcamento.some((l) => l.id === t.linha)),
            onEscolher: () => recategorizar(ids, null),
          },
          ...itensDeCategorias(dados.config, null, (id) => recategorizar(ids, id)),
        ],
      },
      itemDescartar(itens),
    ];
  };

  const lista = (grupos: GrupoACategorizar[], discreto = false) => (
    <ListaGrupos
      grupos={grupos}
      discreto={discreto}
      editar={editar}
      onMenuGrupo={(e, itens) => menu.abrir(e, itensDoGrupo(itens))}
      onMenuLancamento={(e, t) => menu.abrir(e, [...itensDoLancamento(t), itemDescartar([t])])}
      onDescartar={descartar}
    />
  );

  return (
    <div className="space-y-3">
      <TituloPagina>A categorizar</TituloPagina>

      {cMes.n + cAntes.n === 0 ? (
        <Card className="text-center text-sm text-muted">
          Tudo categorizado.
          <button onClick={() => navegar('painel')} className="mt-3 block w-full font-semibold text-accent-strong max-lg:mt-1 max-lg:min-h-10">
            Voltar ao início
          </button>
        </Card>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-lg font-bold first-letter:uppercase">{nomeMes}</h2>
              {cMes.n > 0 && (
                <span className="tabular text-sm text-ink-2">
                  {cMes.texto} · <span className="font-semibold text-ink">{brl0(cMes.total)}</span>
                </span>
              )}
            </div>
            {cMes.n > 0 ? lista(doMes) : <Card className="text-center text-sm text-muted">Nada a categorizar em {soMes}.</Card>}
          </section>

          {cAntes.n > 0 && (
            <section className="space-y-2 pt-2">
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={() => setVerAntes(!verAntes)}
                  aria-expanded={verAntes}
                  className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm text-ink-2 max-lg:min-h-10"
                >
                  {verAntes ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
                  {/* no celular não cabe numa linha: a contagem desce para baixo do título */}
                  <span className="flex min-w-0 items-center gap-1 max-lg:flex-col max-lg:items-start max-lg:gap-0">
                    <span className="font-semibold">Antes de {soMes}</span>
                    <span className="tabular truncate text-muted max-lg:max-w-full max-lg:text-xs">
                      <span className="max-lg:hidden">· </span>
                      {cAntes.texto} · {brl0(cAntes.total)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => descartar(antes.flatMap((g) => g.itens))}
                  className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink-2 max-lg:-mr-2 max-lg:py-3"
                >
                  Descartar todos
                </button>
              </div>
              {verAntes && lista(antes, true)}
            </section>
          )}
        </>
      )}
      {menu.menu}
    </div>
  );
}

type EventoMenu = MouseEvent<HTMLElement>;

function ListaGrupos({
  grupos,
  discreto,
  editar,
  onMenuGrupo,
  onMenuLancamento,
  onDescartar,
}: {
  grupos: GrupoACategorizar[];
  /** meses anteriores: visual mais apagado */
  discreto: boolean;
  editar: (t: Transacao) => void;
  onMenuGrupo: (e: EventoMenu, itens: Transacao[]) => void;
  onMenuLancamento: (e: EventoMenu, t: Transacao) => void;
  onDescartar: (itens: Transacao[]) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <Card className="p-0">
      <ul className="divide-y divide-borda">
        {grupos.map((g) => {
          const varios = g.itens.length > 1;
          const expandido = aberto === g.nome;
          return (
            <li key={g.nome}>
              <div className="group flex items-center hover:bg-surface-2/50">
                <button
                  onClick={() => (varios ? setAberto(expandido ? null : g.nome) : editar(g.itens[0]))}
                  onContextMenu={(e) => (varios ? onMenuGrupo(e, g.itens) : onMenuLancamento(e, g.itens[0]))}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left active:bg-surface-2"
                  aria-expanded={varios ? expandido : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${discreto ? 'text-ink-2' : ''}`}>{g.nome}</div>
                    <div className="text-xs text-muted">
                      {varios ? `${g.itens.length} lançamentos · último ${dataCurta(g.itens[0].data)}` : dataCurta(g.itens[0].data)}
                    </div>
                  </div>
                  <span className={`tabular shrink-0 text-sm ${discreto ? 'text-ink-2' : 'font-semibold'}`}>{brl(g.total)}</span>
                  {expandido ? <ChevronDown size={16} className="shrink-0 text-muted" /> : <ChevronRight size={16} className="shrink-0 text-muted" />}
                </button>
                <BotaoDescartar rotulo={varios ? `Descartar os ${g.itens.length} de ${g.nome}` : `Descartar ${g.nome}`} onClick={() => onDescartar(g.itens)} />
              </div>
              {expandido && (
                <ul className="border-t border-borda bg-surface-2/50">
                  {g.itens.map((t) => (
                    <li key={t.id} className="group flex items-center">
                      <button
                        onClick={() => editar(t)}
                        onContextMenu={(e) => onMenuLancamento(e, t)}
                        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-8 text-left text-sm active:bg-surface-2"
                      >
                        <span className="tabular text-muted">{dataCurta(t.data)}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-2">{t.descricao}</span>
                        <span className="tabular shrink-0">{brl(t.valor)}</span>
                      </button>
                      <BotaoDescartar rotulo={`Descartar ${t.descricao}`} onClick={() => onDescartar([t])} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** ✕ de descartar: aparece ao passar o mouse no computador; no celular fica sempre. */
function BotaoDescartar({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Descartar"
      aria-label={rotulo}
      className="mx-2 shrink-0 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink-2 max-lg:mx-0.5 max-lg:p-3 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
    >
      <X size={15} />
    </button>
  );
}
