import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Ellipsis,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useDados } from '../lib/estado';
import { isoMes, nomeMesCurto } from '../lib/datas';
import { brl, brl0, lerValor, num, valorParaCampo } from '../lib/formato';
import { novoId } from '../lib/id';
import {
  aportePlanejado,
  cascataMetas,
  custoReal,
  EMPRESTIMO,
  moverNaCascata,
  r2,
  reordenar,
  resumoPatrimonio,
  ritmoAporte,
  type EtapaCascata,
} from '../lib/calculos';
import type { Meta } from '../lib/tipos';
import { Ajuda, Botao, Card, Campo, Entrada, Folha, Medidor, Seletor, TituloPagina } from '../components/ui';
import { useMenuContexto, type ItemMenu } from '../components/Menu';

type AbrirMenu = (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
/** onde a meta arrastada vai cair: antes ou depois de outra */
type Destino = { id: string; antes: boolean };

export function Metas(_props: { navegar: (r: string) => void }) {
  const { dados } = useDados();
  const mes = isoMes();
  const custo = custoReal(dados.config, dados.transacoes, mes).valor;
  const pat = resumoPatrimonio(dados.patrimonio);
  const planejado = aportePlanejado(dados.config);
  const ritmo = ritmoAporte(dados.metas, mes, planejado);
  const etapas = cascataMetas(dados.metas, pat.reserva, pat.emprestimos, custo, ritmo.valor, mes);
  const cumpridas = dados.metas.metas.filter((m) => m.concluida);
  const [pagarDivida, setPagarDivida] = useState(false);
  const [editarMeta, setEditarMeta] = useState<Meta | 'nova' | null>(null);
  const [verCumpridas, setVerCumpridas] = useState(false);
  const { excluir, marcar, mover, excluirEmprestimo } = useOperacoesMetas();
  const menu = useMenuContexto();
  const acharMeta = (id: string) => dados.metas.metas.find((m) => m.id === id);
  // a ordem da cascata (com a etapa do empréstimo) é a que se arrasta e a que o menu sobe/desce
  const ordem = etapas.map((e) => e.id);
  const [arrastada, setArrastada] = useState<{ id: string; nome: string; comDedo: boolean } | null>(null);
  const [destino, setDestino] = useState<Destino | null>(null);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // no toque, só pela alça ⠿ e sem esperar (o toque longo no cartão abre o menu)
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
  );

  // enquanto arrasta no iPhone, a página não rola junto; e se o dnd-kit não avisar o fim (soltou rápido demais), não fica preso
  useEffect(() => {
    if (!arrastada) return;
    const travar = (e: TouchEvent) => e.preventDefault();
    let soltou: ReturnType<typeof setTimeout> | undefined;
    const aoSoltar = () => {
      soltou = setTimeout(() => {
        setArrastada(null);
        setDestino(null);
      }, 50);
    };
    document.addEventListener('touchmove', travar, { passive: false });
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('touchend', aoSoltar);
    return () => {
      document.removeEventListener('touchmove', travar);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('touchend', aoSoltar);
      clearTimeout(soltou);
    };
  }, [arrastada]);

  /** soltar ali muda a ordem? (antes da seguinte ou depois da anterior = mesmo lugar) */
  const muda = (id: string, d: Destino) => reordenar(ordem, (x) => x, id, d.id, d.antes).some((x, k) => x !== ordem[k]);
  const aoComecar = (ev: DragStartEvent) => {
    const id = String(ev.active.id);
    setArrastada({ id, nome: etapas.find((e) => e.id === id)?.nome ?? '', comDedo: !!ev.activatorEvent && 'touches' in ev.activatorEvent });
    navigator.vibrate?.(10);
  };
  const aoMover = (ev: DragMoveEvent) => {
    const d = destinoDe(ev.collisions);
    setDestino((atual) => (atual?.id === d?.id && atual?.antes === d?.antes ? atual : d));
  };
  const aoTerminar = (ev: DragEndEvent) => {
    const id = String(ev.active.id);
    const d = destinoDe(ev.collisions);
    setArrastada(null);
    setDestino(null);
    if (d && muda(id, d)) mover(id, d.id, d.antes);
  };

  const itensDePrioridade = (id: string): ItemMenu[] => {
    const i = ordem.indexOf(id);
    return [
      { id: 'subir', rotulo: 'Subir prioridade', icone: <ArrowUp size={15} />, desativado: i <= 0, onEscolher: () => mover(id, ordem[i - 1], true) },
      {
        id: 'descer',
        rotulo: 'Descer prioridade',
        icone: <ArrowDown size={15} />,
        desativado: i < 0 || i >= ordem.length - 1,
        onEscolher: () => mover(id, ordem[i + 1], false),
      },
    ];
  };
  const itensDoEmprestimo = (): ItemMenu[] => {
    const [subir, descer] = itensDePrioridade(EMPRESTIMO);
    return [
      subir,
      { ...descer, separador: true },
      { id: 'excluir', rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onEscolher: excluirEmprestimo },
    ];
  };
  const itensDaMeta = (m: Meta): ItemMenu[] => {
    const prioridade = itensDePrioridade(m.id);
    return [
      { id: 'editar', rotulo: 'Editar…', icone: <Pencil size={15} />, onEscolher: () => setEditarMeta(m) },
      prioridade[0],
      { ...prioridade[1], separador: true },
      { id: 'cumprida', rotulo: 'Marcar como cumprida', icone: <CircleCheck size={15} />, separador: true, onEscolher: () => marcar(m, true) },
      { id: 'excluir', rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onEscolher: () => excluir(m) },
    ];
  };
  const itensDaCumprida = (m: Meta): ItemMenu[] => [
    { id: 'voltar', rotulo: 'Voltar para as metas', icone: <RotateCcw size={15} />, separador: true, onEscolher: () => marcar(m, false) },
    { id: 'excluir', rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onEscolher: () => excluir(m) },
  ];

  return (
    <div className="space-y-3">
      <TituloPagina>
        <span className="flex items-center gap-2">
          Metas
          <Ajuda>Uma de cada vez, em ordem: o saldo das contas marcadas como reserva (em Patrimônio) enche as metas de cima para baixo.</Ajuda>
        </span>
      </TituloPagina>

      <Card>
        <div className="flex items-center gap-1 text-xs text-muted">
          Ritmo usado na previsão
          <Ajuda>
            O quanto você guardou de verdade nos últimos 3 meses; sem histórico, a sobra do plano ({brl0(planejado)}/mês = renda fixa − plano do
            mês).
          </Ajuda>
        </div>
        <div className="text-xl font-semibold">{brl0(ritmo.valor)}/mês</div>
        <div className="text-xs text-muted">{ritmo.fonte === 'real' ? 'média real (3 meses)' : 'sobra do plano'}</div>
      </Card>

      <DndContext
        sensors={sensores}
        collisionDetection={maisPerto}
        onDragStart={aoComecar}
        onDragMove={aoMover}
        onDragEnd={aoTerminar}
        onDragCancel={() => {
          setArrastada(null);
          setDestino(null);
        }}
        autoScroll={{ threshold: { x: 0, y: 0.15 } }}
      >
        <ol className="space-y-3">
          {etapas.map((e, i) => {
            const meta = acharMeta(e.id);
            const linha = arrastada && destino?.id === e.id && muda(arrastada.id, destino) ? (destino.antes ? 'antes' : 'depois') : undefined;
            return (
              <li key={e.id}>
                <CartaoEtapa
                  etapa={e}
                  ordem={i + 1}
                  linha={linha}
                  onPagar={() => setPagarDivida(true)}
                  onEditar={meta ? () => setEditarMeta(meta) : undefined}
                  onMenu={(ev) => menu.abrir(ev, meta ? itensDaMeta(meta) : itensDoEmprestimo())}
                />
              </li>
            );
          })}
        </ol>
        {createPortal(
          <DragOverlay dropAnimation={null} modifiers={[noPonteiro]}>
            {arrastada && (
              <div className="flex h-full items-center justify-center">
                <div
                  className={`flex w-max max-w-72 items-center gap-2 rounded-lg border border-accent bg-surface px-3 py-1.5 text-sm font-semibold shadow-2xl ${
                    arrastada.comDedo ? '-translate-y-[calc(50%+32px)]' : 'translate-x-[calc(50%+14px)] translate-y-[calc(50%+14px)]'
                  }`}
                >
                  <GripVertical size={14} className="shrink-0 text-muted" />
                  <span className="truncate">{arrastada.nome}</span>
                </div>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <button className="flex items-center gap-1 px-1 text-sm font-semibold text-accent-strong max-lg:min-h-10" onClick={() => setEditarMeta('nova')}>
        <Plus size={16} /> Nova meta
      </button>

      {cumpridas.length > 0 && (
        <section className="pt-2">
          <button
            className="flex items-center gap-1 px-1 text-sm font-semibold text-ink-2 max-lg:min-h-10"
            onClick={() => setVerCumpridas(!verCumpridas)}
            aria-expanded={verCumpridas}
          >
            {verCumpridas ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Cumpridas ({cumpridas.length})
          </button>
          {verCumpridas && (
            <Card className="mt-2 p-0">
              <ul className="divide-y divide-borda">
                {cumpridas.map((m) => {
                  const abrirMenu: AbrirMenu = (ev) => menu.abrir(ev, itensDaCumprida(m));
                  return (
                    <li
                      key={m.id}
                      className="group flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2/50"
                      onClick={() => setEditarMeta(m)}
                      onContextMenu={abrirMenu}
                    >
                      <Check size={15} strokeWidth={3} className="shrink-0 text-good" />
                      <span className="min-w-0 flex-1 truncate text-ink-2">{m.nome}</span>
                      <span className="tabular shrink-0 text-muted">{brl0(m.alvo ?? (m.alvoMesesCusto ?? 0) * custo)}</span>
                      <BotaoMais onAbrir={abrirMenu} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>
      )}

      {pagarDivida && <FolhaPagarDivida onFechar={() => setPagarDivida(false)} />}
      {editarMeta && <FolhaMeta meta={editarMeta === 'nova' ? null : editarMeta} onFechar={() => setEditarMeta(null)} />}
      {menu.menu}
    </div>
  );
}

/** A meta mais perto do ponteiro (na vertical); na metade de cima dela, cai antes; na de baixo, depois.
 *  Mede os cartões na hora (e não no começo do arraste), para continuar certo quando a página rola. */
const maisPerto: CollisionDetection = ({ droppableContainers, pointerCoordinates: p }) => {
  if (!p) return [];
  let melhor: Collision | null = null;
  let menor = Infinity;
  for (const c of droppableContainers) {
    const r = c.node.current?.getBoundingClientRect();
    if (!r) continue;
    const d = Math.max(0, r.top - p.y, p.y - r.bottom);
    if (d < menor) {
      menor = d;
      melhor = { id: c.id, data: { antes: p.y < r.top + r.height / 2 } };
    }
  }
  return melhor ? [melhor] : [];
};

const destinoDe = (colisoes: Collision[] | null): Destino | null => {
  const c = colisoes?.[0];
  return c ? { id: String(c.id), antes: !!c.data?.antes } : null;
};

/** O que é arrastado acompanha o ponteiro (o centro dele vai para onde o ponteiro está). */
const noPonteiro: Modifier = ({ activatorEvent: ev, draggingNodeRect: r, transform }) => {
  const p = ev && 'touches' in ev ? (ev as TouchEvent).touches[0] : (ev as MouseEvent | null);
  if (!p || !r) return transform;
  return { ...transform, x: transform.x + p.clientX - r.left - r.width / 2, y: transform.y + p.clientY - r.top - r.height / 2 };
};

/** Tira a meta do lugar e põe antes ou depois de outra; a ordem das metas é a prioridade (as cumpridas ficam onde estão). */
/** Excluir e marcar como cumprida agem na hora, com Desfazer no aviso. Mover muda a prioridade. */
function useOperacoesMetas() {
  const { dados, atualizar, aviso } = useDados();

  const comEmprestimo = resumoPatrimonio(dados.patrimonio).emprestimos > 0 && !dados.metas.semEmprestimo;

  const excluir = async (meta: Meta) => {
    const i = dados.metas.metas.findIndex((x) => x.id === meta.id);
    if (i < 0) return;
    const original = dados.metas.metas[i];
    // o empréstimo vinha logo depois dela: continua no mesmo lugar (depois da anterior, ou em primeiro)
    const ancora = dados.metas.emprestimoDepois === meta.id;
    await atualizar('metas', (m) => {
      const metas = m.metas.filter((x) => x.id !== meta.id);
      if (m.emprestimoDepois !== meta.id) return { ...m, metas };
      const anterior = m.metas[m.metas.findIndex((x) => x.id === meta.id) - 1]?.id;
      return { ...m, metas, emprestimoDepois: anterior };
    });
    aviso(`“${original.nome}” excluída`, 'ok', {
      rotulo: 'Desfazer',
      fazer: () =>
        atualizar('metas', (m) =>
          m.metas.some((x) => x.id === original.id)
            ? m
            : { ...m, metas: [...m.metas.slice(0, i), original, ...m.metas.slice(i)], ...(ancora ? { emprestimoDepois: original.id } : {}) },
        ),
    });
  };

  const marcar = async (meta: Meta, concluida: boolean) => {
    const trocar = (sim: boolean) =>
      atualizar('metas', (m) => ({ ...m, metas: m.metas.map((x) => (x.id === meta.id ? { ...x, concluida: sim || undefined } : x)) }));
    await trocar(concluida);
    aviso(concluida ? `“${meta.nome}” cumprida` : `“${meta.nome}” voltou para as metas`, 'ok', { rotulo: 'Desfazer', fazer: () => trocar(!concluida) });
  };

  const mover = (id: string, alvo: string, antes: boolean) => atualizar('metas', (m) => moverNaCascata(m, id, alvo, antes, comEmprestimo));

  /** a etapa do empréstimo sai das metas; a dívida continua em Dívidas */
  const excluirEmprestimo = async () => {
    const trocar = (sem: boolean) => atualizar('metas', (m) => ({ ...m, semEmprestimo: sem || undefined }));
    await trocar(true);
    aviso('“Quitar empréstimo” excluída das metas', 'ok', { rotulo: 'Desfazer', fazer: () => trocar(false) });
  };

  return { excluir, marcar, mover, excluirEmprestimo };
}

/** "⋯" que abre o mesmo menu do botão direito: aparece no hover no computador, sempre no celular. */
function BotaoMais({ onAbrir }: { onAbrir: AbrirMenu }) {
  return (
    <button
      type="button"
      aria-label="Opções"
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onAbrir({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {} });
      }}
      className="-m-1.5 shrink-0 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink-2 max-lg:-m-2.5 max-lg:p-2.5 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
    >
      <Ellipsis size={18} />
    </button>
  );
}

function CartaoEtapa({
  etapa: e,
  ordem,
  linha,
  onPagar,
  onEditar,
  onMenu,
}: {
  etapa: EtapaCascata;
  ordem: number;
  /** a meta arrastada cai aqui: antes ou depois desta */
  linha?: 'antes' | 'depois';
  onPagar: () => void;
  /** sem editar: a etapa do empréstimo, que não é meta (só muda de lugar) */
  onEditar?: () => void;
  onMenu: AbrirMenu;
}) {
  const ehDivida = e.id === EMPRESTIMO;
  const arrastar = useDraggable({ id: e.id });
  const soltar = useDroppable({ id: e.id });
  return (
    <div
      ref={(el) => {
        arrastar.setNodeRef(el);
        soltar.setNodeRef(el);
      }}
      // com o mouse, arrasta pelo cartão inteiro; no toque, só pela alça (abaixo)
      onMouseDown={(ev) => arrastar.listeners?.onMouseDown?.(ev)}
      className={`group relative select-none rounded-2xl ${onEditar ? 'cursor-pointer' : ''} ${arrastar.isDragging ? 'opacity-40' : ''}`}
      style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}
      role={onEditar ? 'button' : undefined}
      tabIndex={onEditar ? 0 : undefined}
      onClick={onEditar}
      onKeyDown={(ev) => {
        if (!onEditar || ev.target !== ev.currentTarget || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        onEditar();
      }}
      onContextMenu={onMenu}
    >
      <Card className={e.atual ? 'border-accent ring-1 ring-accent' : e.completa ? 'opacity-80' : ''}>
        <div className="flex items-start gap-3">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              e.completa ? 'bg-good text-white' : e.atual ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
            }`}
          >
            {e.completa ? <Check size={14} strokeWidth={3} /> : ordem}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{e.nome}</span>
              <span className="flex items-center gap-2">
                {e.atual && <span className="text-xs font-semibold text-accent-strong">agora</span>}
                <BotaoMais onAbrir={onMenu} />
              </span>
            </div>
            <div className="my-2">
              <Medidor valor={ehDivida ? 0 : e.saldo} total={e.alvo} tom="good" />
            </div>
            <div className="flex justify-between gap-2 text-sm">
              <span className="tabular">
                {ehDivida ? `falta pagar ${brl0(e.alvo)}` : (
                  <>
                    {brl0(e.saldo)} <span className="text-muted">de {brl0(e.alvo)}</span>
                  </>
                )}
              </span>
              <span className="text-ink-2">
                {e.completa ? 'completa' : e.previsao ? nomeMesCurto(e.previsao) : 'sem previsão'}
              </span>
            </div>
            {!e.completa && e.mesesFaltando !== null && e.mesesFaltando > 0 && (
              <div className="mt-0.5 text-xs text-muted">≈ {num(e.mesesFaltando)} meses a partir de hoje</div>
            )}
            {e.nota && <p className="mt-2 text-xs text-muted">{e.nota}</p>}
            {ehDivida && (
              <Botao className="mt-3" variante="secundario" onClick={onPagar}>
                Paguei o empréstimo
              </Botao>
            )}
          </div>
        </div>
      </Card>
      {/* a alça: no toque, a área cresce (o desenho fica no mesmo lugar) e não rola a página */}
      <span
        aria-hidden
        data-sem-toque-longo
        onTouchStart={(ev) => arrastar.listeners?.onTouchStart?.(ev)}
        className="absolute left-0.5 top-1/2 flex -translate-y-1/2 cursor-grab items-center text-muted lg:opacity-0 lg:group-hover:opacity-100 pointer-coarse:left-0 pointer-coarse:h-12 pointer-coarse:w-10 pointer-coarse:pl-0.5 pointer-coarse:opacity-100"
        style={{ touchAction: 'none' }}
      >
        <GripVertical size={14} />
      </span>
      {linha && (
        <span aria-hidden className={`absolute inset-x-1 h-0.5 rounded-full bg-accent ${linha === 'antes' ? '-top-[7px]' : '-bottom-[7px]'}`} />
      )}
    </div>
  );
}

function FolhaPagarDivida({ onFechar }: { onFechar: () => void }) {
  const { dados, atualizar, aviso } = useDados();
  const emprestimos = dados.patrimonio.dividas.filter((d) => d.tipo === 'emprestimo');
  const correntes = dados.patrimonio.contas.filter((c) => !c.reserva);
  const [divida, setDivida] = useState(emprestimos[0]?.id ?? '');
  const d = emprestimos.find((x) => x.id === divida);
  const [valor, setValor] = useState(valorParaCampo(d?.valor));
  const [de, setDe] = useState(correntes[0]?.id ?? '');
  useEffect(() => {
    setValor(valorParaCampo(d?.valor));
  }, [d?.valor]);
  const v = lerValor(valor);

  const salvar = async () => {
    if (!d || !v) return;
    await atualizar('patrimonio', (p) => ({
      ...p,
      contas: p.contas.map((c) => (c.id === de ? { ...c, saldo: r2(c.saldo - v) } : c)),
      dividas: p.dividas.flatMap((x) => (x.id !== d.id ? [x] : x.valor - v > 0.009 ? [{ ...x, valor: r2(x.valor - v) }] : [])),
    }));
    aviso(v >= d.valor ? 'Empréstimo quitado!' : `${brl(v)} pagos`);
    onFechar();
  };

  return (
    <Folha aberta titulo="Pagar empréstimo" onFechar={onFechar}>
      {emprestimos.length > 1 && (
        <Campo rotulo="Qual">
          <Seletor value={divida} onChange={(e) => setDivida(e.target.value)}>
            {emprestimos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome} ({brl0(x.valor)})
              </option>
            ))}
          </Seletor>
        </Campo>
      )}
      <Campo rotulo="Valor pago (R$)">
        <Entrada inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Campo>
      <Campo rotulo="Saiu de">
        <Seletor value={de} onChange={(e) => setDe(e.target.value)}>
          {correntes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Seletor>
      </Campo>
      <Botao className="w-full py-3" disabled={!v || !d} onClick={salvar}>
        Registrar pagamento
      </Botao>
    </Folha>
  );
}

function FolhaMeta({ meta, onFechar }: { meta: Meta | null; onFechar: () => void }) {
  const { atualizar, aviso } = useDados();
  const { excluir } = useOperacoesMetas();
  const porMeses = meta?.alvoMesesCusto !== undefined;
  const [nome, setNome] = useState(meta?.nome ?? '');
  const [alvo, setAlvo] = useState(valorParaCampo(porMeses ? meta?.alvoMesesCusto : meta?.alvo));
  const [nota, setNota] = useState(meta?.nota ?? '');
  const v = lerValor(alvo);

  const salvar = async () => {
    if (!nome.trim() || !v) return;
    const nova: Meta = {
      id: meta?.id ?? novoId(),
      nome: nome.trim(),
      ...(porMeses ? { alvoMesesCusto: v } : { alvo: v }),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      ...(meta?.concluida ? { concluida: true } : {}),
    };
    await atualizar('metas', (m) => ({ ...m, metas: meta ? m.metas.map((x) => (x.id === meta.id ? nova : x)) : [...m.metas, nova] }));
    aviso('Meta salva');
    onFechar();
  };

  return (
    <Folha aberta titulo={meta ? 'Editar meta' : 'Nova meta'} onFechar={onFechar}>
      <Campo rotulo="Nome">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo={porMeses ? 'Alvo (meses de custo)' : 'Alvo (R$)'}>
        <Entrada inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
      </Campo>
      <Campo rotulo="Nota">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="opcional" />
      </Campo>
      <Botao className="w-full py-3" disabled={!nome.trim() || !v} onClick={salvar}>
        Salvar
      </Botao>
      {meta && (
        <button
          type="button"
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-critical active:bg-surface-2"
          onClick={() => {
            onFechar();
            excluir(meta);
          }}
        >
          <Trash2 size={15} /> Excluir meta
        </button>
      )}
    </Folha>
  );
}
