// Detalhe de uma categoria (direita, na visão Pastas; folha no celular): nome, plano, tipo e nota salvam sozinhos;
// embaixo, onde o dinheiro foi (por estabelecimento). Cada item arrasta para uma pasta (mouse) ou muda de categoria pelo
// botão direito (no toque, segurar o dedo).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, FolderInput, List, Merge, Trash2, TriangleAlert, X } from 'lucide-react';
import { useDados } from '../lib/estado';
import { despesasNoPeriodo, mesesNoPeriodo, NAO_PLANEJADO, nomeEstabelecimento, type Periodo } from '../lib/analise';
import { caminho, descendentes, NATUREZAS, planoTotal, temFilhas } from '../lib/categorias';
import { dataCurta } from '../lib/datas';
import { ramoDe } from '../lib/fluxo';
import { brl, brl0, lerValor, valorParaCampo } from '../lib/formato';
import type { LinhaOrcamento, Natureza, Transacao } from '../lib/tipos';
import { useMenuDoLancamento, useOperacoesCategorias } from './AcoesCategoria';
import { corDoNo } from './fluxo/FluxoGastos';
import { itensDeCategorias, useMenuContexto, type ItemMenu } from './Menu';
import { useLancamentosArrastaveis } from './Arrastar';
import { SeletorCategoria } from './SeletorCategoria';
import { Ajuda, Botao, IconeComportamento, useComputador } from './ui';

export interface PropsDetalhe {
  /** id da categoria ou NAO_PLANEJADO */
  id: string;
  /** só os lançamentos próprios dela (veio do "(geral)" do Fluxo) */
  soProprios?: boolean;
  periodo: Periodo;
  /** filtro de tipo da tela (null = todos): os lançamentos das de dentro seguem o filtro */
  natureza: Natureza | null;
  /** abre o Lançar para editar um lançamento */
  editar: (t: Transacao) => void;
  onFechar: () => void;
  /** "Juntar com outra": a tela põe a lista em modo "clique na outra" */
  onJuntar: (id: string) => void;
  /** foco no nome ao abrir (ex.: Renomear pelo botão direito do Fluxo) */
  focarNome?: boolean;
  /** sem o × (e sem Esc): quando o detalhe sempre fica aberto ao lado da lista */
  semFechar?: boolean;
}

export function DetalheCategoria(props: PropsDetalhe) {
  const { id, onFechar } = props;
  const { dados } = useDados();
  // juntada ou excluída por outro caminho: fecha
  const existe = id === NAO_PLANEJADO || dados.config.orcamento.some((l) => l.id === id);
  useEffect(() => {
    if (!existe) onFechar();
  }, [existe, onFechar]);
  if (!existe) return null;
  // key: trocar de categoria recarrega os campos
  return <Detalhe key={id} {...props} />;
}

function Detalhe({ id, soProprios, periodo, natureza, editar, onFechar, onJuntar, focarNome, semFechar }: PropsDetalhe) {
  const { dados } = useDados();
  const { config, transacoes } = dados;
  const ops = useOperacoesCategorias();
  const menu = useMenuContexto();
  const itensDoLancamento = useMenuDoLancamento(editar);
  const naoPlanejado = id === NAO_PLANEJADO;
  const l = config.orcamento.find((x) => x.id === id);

  useEffect(() => {
    if (semFechar) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      onFechar();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar, semFechar]);

  const lancamentos = useMemo(() => {
    let entra: (t: Transacao) => boolean;
    if (naoPlanejado) {
      const existentes = new Set(config.orcamento.map((x) => x.id));
      entra = (t) => !t.linha || !existentes.has(t.linha);
    } else if (soProprios) {
      entra = (t) => t.linha === id;
    } else {
      const dentro = descendentes(config, id);
      const doTipo = natureza ? new Set(config.orcamento.filter((x) => x.natureza === natureza).map((x) => x.id)) : null;
      entra = (t) => !!t.linha && dentro.has(t.linha) && (!doTipo || doTipo.has(t.linha));
    }
    return despesasNoPeriodo(transacoes, periodo)
      .filter(entra)
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [transacoes, config, periodo.de, periodo.ate, id, soProprios, natureza, naoPlanejado]);

  const total = lancamentos.reduce((s, t) => s + t.valor, 0);
  const meses = mesesNoPeriodo(periodo);
  // o plano por mês do que a tela está mostrando (com as de dentro e o filtro de tipo; pelo "(geral)", só o próprio)
  const plano = useMemo(() => {
    if (naoPlanejado) return 0;
    const ids = soProprios ? new Set([id]) : descendentes(config, id);
    return config.orcamento.filter((x) => ids.has(x.id) && (!natureza || x.natureza === natureza)).reduce((s, x) => s + x.valor, 0);
  }, [config, id, soProprios, natureza, naoPlanejado]);
  const onde = useMemo(() => {
    const mapa = new Map<string, Transacao[]>();
    for (const t of lancamentos) {
      const nome = nomeEstabelecimento(t.descricao);
      mapa.set(nome, [...(mapa.get(nome) ?? []), t]);
    }
    return [...mapa]
      .map(([nome, itens]) => ({ nome, itens, total: Math.round(itens.reduce((s, t) => s + t.valor, 0) * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  }, [lancamentos]);
  const maior = Math.max(1, ...onde.map((e) => e.total));
  const cor = naoPlanejado ? 'var(--warning)' : corDoNo({ ramo: ramoDe(config, id), profundidade: 1 });
  const nomes = new Map(config.orcamento.map((x) => [x.id, x.nome]));
  const acima = caminho(config, id).slice(0, -1);

  const excluir = async () => {
    if (await ops.excluir(id)) onFechar();
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {l ? (
            <NomeEditavel linha={l} focar={focarNome} />
          ) : (
            <h2 className="flex items-center gap-2 py-1 text-xl font-bold">
              <TriangleAlert size={20} className="shrink-0 text-warning" /> Não planejado
            </h2>
          )}
          {acima.length > 0 && <p className="truncate px-1 text-xs text-muted">{acima.map((x) => x.nome).join(' › ')}</p>}
        </div>
        {!semFechar && (
          <button onClick={onFechar} className="-mr-2 rounded-full p-2 text-muted hover:bg-surface-2 active:bg-surface-2 max-lg:p-2.5" aria-label="Fechar">
            <X size={20} />
          </button>
        )}
      </div>

      {/* o total gasto no período, em destaque, com o plano ao lado para comparar */}
      <div className={`mt-3 ${l ? 'px-1' : ''}`}>
        <div className="text-xs font-semibold text-ink-2">Gasto no período</div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-2xl font-bold tracking-tight">{brl(total)}</span>
          {meses > 1.3 && <span className="tabular text-sm text-ink-2">≈ {brl0(total / meses)}/mês</span>}
          {plano > 0 && <span className="tabular text-sm text-muted">plano {brl0(plano)}/mês</span>}
        </div>
        <div className="text-xs text-muted">
          {lancamentos.length} lançamento{lancamentos.length === 1 ? '' : 's'}
        </div>
      </div>

      {l && <Campos linha={l} />}

      <section className="mt-5">
        <h3 className="mb-1 text-xs font-semibold text-muted">Onde</h3>
        {onde.length === 0 ? (
          <p className="text-sm text-muted">Nada no período.</p>
        ) : (
          <ul className="-mx-2">
            {onde.map((g) => (
              <ItemOnde
                key={g.nome}
                grupo={g}
                maior={maior}
                cor={cor}
                idCategoria={naoPlanejado ? null : id}
                nomes={nomes}
                editar={editar}
                abrirMenu={menu.abrir}
                itensDoLancamento={itensDoLancamento}
              />
            ))}
          </ul>
        )}
      </section>

      {l && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-borda pt-4">
          <Botao variante="secundario" onClick={() => onJuntar(id)}>
            <Merge size={15} /> Juntar com outra
          </Botao>
          <Botao variante="secundario" className="text-critical!" onClick={excluir}>
            <Trash2 size={15} /> Excluir
          </Botao>
        </div>
      )}

      {menu.menu}
    </div>
  );
}

type AbrirMenu = ReturnType<typeof useMenuContexto>['abrir'];

/** Um estabelecimento: barra do quanto foi lá; clicar mostra os lançamentos; arrasta para uma pasta; botão direito muda a categoria. */
function ItemOnde({
  grupo: g,
  maior,
  cor,
  idCategoria,
  nomes,
  editar,
  abrirMenu,
  itensDoLancamento,
}: {
  grupo: { nome: string; itens: Transacao[]; total: number };
  maior: number;
  cor: string;
  /** a categoria do detalhe (null = não planejado) */
  idCategoria: string | null;
  nomes: Map<string, string>;
  editar: (t: Transacao) => void;
  abrirMenu: AbrirMenu;
  itensDoLancamento: (t: Transacao) => ItemMenu[];
}) {
  const { dados } = useDados();
  const { recategorizar } = useOperacoesCategorias();
  const [aberto, setAberto] = useState(false);
  const ids = g.itens.map((t) => t.id);
  const arrastar = useLancamentosArrastaveis(`est:${g.nome}`, ids, g.nome);
  const varios = g.itens.length > 1;
  const comum = g.itens.every((t) => t.linha === g.itens[0].linha) ? g.itens[0].linha : undefined;
  const sub = comum && comum !== idCategoria ? nomes.get(comum) : undefined;
  // a categoria como o seletor entende: id de uma que existe, null = não planejado, undefined = misturadas
  const categoriaDe = (linha: string | null | undefined) => (linha && nomes.has(linha) ? linha : null);

  const itens = (): ItemMenu[] => [
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
          marcado: comum !== undefined && !nomes.has(comum ?? ''),
          onEscolher: () => recategorizar(ids, null),
        },
        ...itensDeCategorias(dados.config, comum, (destino) => recategorizar(ids, destino)),
      ],
    },
    { id: 'ver', rotulo: aberto ? 'Esconder compras' : 'Ver compras', icone: <List size={15} />, onEscolher: () => setAberto((a) => !a) },
  ];

  return (
    <li>
      <div
        ref={arrastar.setNodeRef}
        {...arrastar.listeners}
        {...arrastar.attributes}
        role="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        onContextMenu={(e) => abrirMenu(e, itens())}
        className={`cursor-default select-none rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2 ${
          arrastar.isDragging ? 'opacity-40' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <ChevronRight size={13} className={`shrink-0 text-muted transition-transform ${aberto ? 'rotate-90' : ''}`} />
            <span className="truncate">{g.nome}</span>
            <span className="shrink-0 text-xs text-muted max-lg:hidden">{varios ? `× ${g.itens.length}` : dataCurta(g.itens[0].data)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {sub && <span className="max-w-40 truncate text-xs text-muted max-lg:hidden">{sub}</span>}
            <span className="tabular">{brl(g.total)}</span>
          </span>
        </div>
        {/* no celular, o ×N (ou a data) e a subcategoria descem para baixo do nome: na mesma linha, o nome ficava cortado */}
        <div className="truncate pl-[17px] text-xs text-muted lg:hidden">
          {varios ? `× ${g.itens.length}` : dataCurta(g.itens[0].data)}
          {sub && ` · ${sub}`}
        </div>
        <div className="mt-1 h-1.5 rounded-r" style={{ width: `${Math.max(1, (Math.max(0, g.total) / maior) * 100)}%`, background: cor }} />
      </div>
      {aberto && (
        <div className="mb-2 ml-3.5 border-l border-borda pl-2 pt-1">
          {varios && (
            <div className="mb-1 flex items-center gap-2 px-1">
              <span className="shrink-0 text-xs text-muted">Todas</span>
              <SeletorCategoria
                valor={comum === undefined ? undefined : categoriaDe(comum)}
                rotulo={comum === undefined ? <span className="text-muted">Várias categorias</span> : undefined}
                onEscolher={(destino) => recategorizar(ids, destino)}
                className="max-w-sm"
              />
            </div>
          )}
          <ul>
            {g.itens.map((t) => (
              <LancamentoOnde
                key={t.id}
                t={t}
                categoria={categoriaDe(t.linha)}
                editar={editar}
                onMenu={(e) => abrirMenu(e, itensDoLancamento(t))}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** Uma compra: a categoria dela se troca ali mesmo; clicar abre o lançamento. */
function LancamentoOnde({
  t,
  categoria,
  editar,
  onMenu,
}: {
  t: Transacao;
  categoria: string | null;
  editar: (t: Transacao) => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const { recategorizar } = useOperacoesCategorias();
  const arrastar = useLancamentosArrastaveis(`t:${t.id}`, [t.id], t.descricao);
  return (
    <li>
      <div
        ref={arrastar.setNodeRef}
        {...arrastar.listeners}
        {...arrastar.attributes}
        role="button"
        onClick={() => editar(t)}
        onContextMenu={onMenu}
        className={`flex cursor-default select-none items-center gap-3 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2 max-lg:flex-wrap max-lg:gap-y-0 ${
          arrastar.isDragging ? 'opacity-40' : ''
        }`}
      >
        <span className="tabular w-11 shrink-0 text-xs text-muted">{dataCurta(t.data)}</span>
        <span className="min-w-0 flex-1 truncate text-ink-2">{t.descricao}</span>
        <span className="tabular shrink-0">{brl(t.valor)}</span>
        {/* no celular a categoria vai para a linha de baixo (ao lado, a descrição sumia) */}
        <span className="hidden basis-full max-lg:block" aria-hidden />
        <SeletorCategoria compacto valor={categoria} onEscolher={(destino) => recategorizar([t.id], destino)} className="max-lg:ml-12 max-lg:py-1.5" />
      </div>
    </li>
  );
}

/**
 * Campo que salva sozinho: ao sair ou no Enter; Esc desfaz. `salvar` grava e devolve o texto que fica
 * no campo (null = inválido, volta ao anterior). Enquanto tem foco, mudanças de fora não atropelam o que se digita.
 */
function useCampoQueSalva<E extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>(atual: string, salvar: (texto: string) => string | null) {
  const [texto, setTexto] = useState(atual);
  const ref = useRef<E>(null);
  const descartar = useRef(false);
  useEffect(() => {
    if (document.activeElement !== ref.current) setTexto(atual);
  }, [atual]);
  return {
    ref,
    value: texto,
    onChange: (e: React.ChangeEvent<E>) => setTexto(e.target.value),
    onBlur: () => {
      if (descartar.current) {
        descartar.current = false;
        setTexto(atual);
        return;
      }
      setTexto(salvar(texto) ?? atual);
    },
    onKeyDown: (e: React.KeyboardEvent<E>) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault(); // na nota em várias linhas (celular), Enter também salva, não quebra a linha
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.stopPropagation(); // Esc no campo só desfaz; não fecha o detalhe nem a folha
        descartar.current = true;
        e.currentTarget.blur();
      }
    },
  };
}

function NomeEditavel({ linha: l, focar }: { linha: LinhaOrcamento; focar?: boolean }) {
  const { editar } = useOperacoesCategorias();
  const campo = useCampoQueSalva(l.nome, (s) => {
    const nome = s.trim();
    if (!nome) return null;
    if (nome !== l.nome) editar(l.id, { nome });
    return nome;
  });
  const { ref } = campo;
  useEffect(() => {
    if (!focar) return;
    ref.current?.focus();
    ref.current?.select();
  }, [focar, ref]);
  return (
    <input
      {...campo}
      aria-label="Nome da categoria"
      spellCheck={false}
      className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xl font-bold text-ink outline-none hover:bg-surface-2 focus:border-accent focus:bg-page"
    />
  );
}

const classeCampo = 'rounded-xl border border-borda bg-page px-3 py-2 text-sm text-ink outline-none focus:border-accent';
const classeRotulo = 'mb-1 flex items-center gap-1 text-xs font-semibold text-ink-2';

function Campos({ linha: l }: { linha: LinhaOrcamento }) {
  const { dados } = useDados();
  const { editar } = useOperacoesCategorias();
  const idPlano = useId();
  const comOutras = temFilhas(dados.config, l.id);
  const pontual = l.natureza === 'pontual';
  const rotuloPlano = comOutras ? (pontual ? 'Média própria' : 'Plano próprio') : pontual ? 'Média por mês' : 'Plano por mês';

  const plano = useCampoQueSalva(l.valor ? valorParaCampo(l.valor) : '', (s) => {
    const v = s.trim() ? lerValor(s) : 0;
    if (v === null || v < 0) return null;
    const valor = Math.round(v * 100) / 100;
    if (valor !== l.valor) editar(l.id, { valor });
    return valor ? valorParaCampo(valor) : '';
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <div className={classeRotulo}>
            <label htmlFor={idPlano}>{rotuloPlano}</label>
            {comOutras && <Ajuda>Com as de dentro: {brl0(planoTotal(dados.config, l.id))}/mês</Ajuda>}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
            <input {...plano} id={idPlano} inputMode="decimal" placeholder="0" className={`${classeCampo} tabular w-36 pl-9`} />
          </div>
        </div>
        <div className="max-lg:w-full">
          <div className={classeRotulo}>
            <span>Comportamento</span>
            <Ajuda rotulo="O que é cada um?">
              {NATUREZAS.map((n) => (
                <span key={n.id} className="mb-1 flex gap-1.5 last:mb-0">
                  <IconeComportamento natureza={n.id} size={12} className="mt-0.5" />
                  <span>
                    <b>{n.nome}</b>: {n.dica}
                  </span>
                </span>
              ))}
            </Ajuda>
          </div>
          <div className="flex rounded-xl bg-surface-2 p-1" role="group" aria-label="Comportamento">
            {NATUREZAS.map((n) => (
              <button
                key={n.id}
                type="button"
                aria-pressed={l.natureza === n.id}
                onClick={() => l.natureza !== n.id && editar(l.id, { natureza: n.id })}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold transition max-lg:flex-1 max-lg:justify-center max-lg:py-2 ${
                  l.natureza === n.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2'
                }`}
              >
                <IconeComportamento natureza={n.id} />
                {n.nome}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Nota linha={l} />
    </div>
  );
}

/** A nota. No computador, numa linha; no celular quebra em quantas linhas precisar (numa linha só, o texto era cortado). */
function Nota({ linha: l }: { linha: LinhaOrcamento }) {
  const { editar } = useOperacoesCategorias();
  const computador = useComputador();
  // o mesmo campo vira input (computador) ou textarea (celular)
  const campo = useCampoQueSalva<HTMLInputElement & HTMLTextAreaElement>(l.nota ?? '', (s) => {
    const texto = s.trim();
    if (texto !== (l.nota ?? '')) editar(l.id, { nota: texto });
    return texto;
  });
  const { ref, value } = campo;
  // no celular, a altura acompanha o texto
  useLayoutEffect(() => {
    const el = ref.current;
    if (computador || !el) return;
    const ajustar = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [computador, value, ref]);
  if (computador) return <input {...campo} aria-label="Nota" placeholder="Nota" className={`${classeCampo} w-full`} />;
  return <textarea {...campo} rows={1} enterKeyHint="done" aria-label="Nota" placeholder="Nota" className={`${classeCampo} block w-full resize-none overflow-hidden`} />;
}
