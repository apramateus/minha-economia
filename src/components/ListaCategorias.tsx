// Lista de categorias da aba Gastos (esquerda, na visão Pastas): pastas dentro de pastas com o valor gasto no período.
// Clicar abre o detalhe; arrastar (mouse) põe uma dentro da outra (ou recebe itens do detalhe); botão direito (no toque,
// segurar o dedo); renomear; juntar.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KeyboardEventReact, type MouseEvent as MouseEventReact } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronRight, Folder, Plus, TriangleAlert } from 'lucide-react';
import { useDados } from '../lib/estado';
import { descendentes, linhasVisiveis, temFilhas, type LinhaVisivel } from '../lib/categorias';
import { gastoNaArvore, NAO_PLANEJADO, type Periodo } from '../lib/analise';
import { ramoDe } from '../lib/fluxo';
import { brl0 } from '../lib/formato';
import type { Natureza } from '../lib/tipos';
import { corDoNo } from './fluxo/FluxoGastos';
import { useMenuDaCategoria, useOperacoesCategorias } from './AcoesCategoria';
import { FaixaTirarDe, podeSoltar, useArrastar, useCategoriaArrastavel } from './Arrastar';
import { useJuntar } from './Juntar';
import { useMenuContexto } from './Menu';
import { EtiquetaTipo } from './ui';

export interface PropsLista {
  periodo: Periodo;
  /** filtro de tipo (null = todos) */
  natureza: Natureza | null;
  /** categoria aberta no detalhe (id ou NAO_PLANEJADO): fica marcada */
  selecionada: string | null;
  /** abrir o detalhe de uma categoria (id ou NAO_PLANEJADO) */
  onAbrir: (id: string) => void;
  /** modo "clique na outra" para juntar: a categoria que vai ser juntada (null = fora do modo) */
  juntando: string | null;
  onJuntando: (id: string | null) => void;
  /** esconder as categorias sem gasto no período */
  esconderVazias?: boolean;
  /** mostrar a etiqueta do tipo (Fixo/Flexível/Pontual) depois do nome */
  mostrarTipo?: boolean;
}

export function ListaCategorias({ periodo, natureza, selecionada, onAbrir, juntando, onJuntando, esconderVazias, mostrarTipo }: PropsLista) {
  const { dados } = useDados();
  const { config, transacoes } = dados;
  const { criar, editar } = useOperacoesCategorias();
  const { arrastado, sobre, fechadas, setFechadas, acabouDeArrastar, movida } = useArrastar();
  const menu = useMenuContexto();
  const modoJuntar = useJuntar(juntando, onJuntando);
  const [focada, setFocada] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const linhasRef = useRef(new Map<string, HTMLDivElement>());

  const comecarRenomear = (id: string) => {
    setFocada(id);
    setRenomeando(id);
  };
  const itensDoMenu = useMenuDaCategoria({ onAbrir, onRenomear: comecarRenomear, onJuntar: onJuntando });

  // categoria acabou de ser movida para dentro de outra: foca e rola até ela
  useEffect(() => {
    if (!movida) return;
    setFocada(movida);
    setTimeout(() => linhasRef.current.get(movida)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
  }, [movida]);

  const { de, ate } = periodo;
  const gasto = useMemo(() => gastoNaArvore(config, transacoes, { de, ate }, natureza), [config, transacoes, de, ate, natureza]);
  const valores = useMemo(() => new Map([...gasto].map(([id, g]) => [id, g.valor])), [gasto]);
  // escondendo as vazias, continuam à vista a aberta, a que está sendo renomeada (ex.: recém-criada) e a que vai ser juntada
  const manter = new Set([selecionada, renomeando, juntando].filter((x): x is string => !!x));
  const linhas = linhasVisiveis(config, fechadas, { valor: valores, natureza, semVazias: esconderVazias, manter });
  const nao = natureza ? undefined : gasto.get(NAO_PLANEJADO);
  const ids = [...(nao ? [NAO_PLANEJADO] : []), ...linhas.map((v) => v.linha.id)];
  const focoAtual = focada && ids.includes(focada) ? focada : ids[0];

  const cor = (id: string, nivel: number) => corDoNo({ ramo: ramoDe(config, id), profundidade: nivel + 1 });

  const alternar = (id: string, tudoDentro = false) =>
    setFechadas((f) => {
      const n = new Set(f);
      const fechar = !f.has(id);
      const alvo = tudoDentro ? [...descendentes(config, id)].filter((x) => temFilhas(config, x)) : [id];
      for (const x of alvo) fechar ? n.add(x) : n.delete(x);
      return n;
    });

  const tocar = (id: string) => {
    if (Date.now() - acabouDeArrastar.current < 400) return;
    setFocada(id);
    if (!juntando) onAbrir(id);
    else modoJuntar.escolherOutra(id);
  };

  const abrirMenu = (e: MouseEventReact, id: string) => {
    if (juntando) return e.preventDefault();
    setFocada(id);
    menu.abrir(e, itensDoMenu(id));
  };

  const focar = (id: string | null | undefined) => {
    if (!id || !ids.includes(id)) return;
    setFocada(id);
    linhasRef.current.get(id)?.focus();
  };

  const teclas = (e: KeyboardEventReact) => {
    if ((e.target as HTMLElement).getAttribute('role') !== 'treeitem' || !focoAtual) return;
    const i = ids.indexOf(focoAtual);
    const v = linhas.find((x) => x.linha.id === focoAtual);
    if (e.key === 'ArrowDown') focar(ids[Math.min(ids.length - 1, i + 1)]);
    else if (e.key === 'ArrowUp') focar(ids[Math.max(0, i - 1)]);
    else if (e.key === 'ArrowRight' && v) v.temFilhas && !v.aberta ? alternar(v.linha.id) : v.aberta && focar(ids[i + 1]);
    else if (e.key === 'ArrowLeft' && v) v.aberta ? alternar(v.linha.id) : focar(v.linha.pai);
    else if (e.key === 'Enter') tocar(focoAtual);
    else return;
    e.preventDefault();
  };

  const renomeado = (id: string, nome: string | null, teclado: boolean) => {
    setRenomeando(null);
    const atual = config.orcamento.find((l) => l.id === id)?.nome;
    if (nome?.trim() && nome.trim() !== atual) editar(id, { nome: nome.trim() });
    if (teclado) linhasRef.current.get(id)?.focus();
  };

  const nova = async () => {
    const id = await criar(natureza ?? 'flexivel');
    if (id) comecarRenomear(id);
  };

  const registrar = (id: string) => (el: HTMLDivElement | null) => {
    if (el) linhasRef.current.set(id, el);
    else linhasRef.current.delete(id);
  };
  return (
    <div className="h-full overflow-y-auto rounded-2xl border border-borda bg-surface">
      {modoJuntar.faixa}
      <FaixaTirarDe />

      <div className="p-1.5">
        <div role="tree" aria-label="Categorias" onKeyDown={teclas}>
          {nao && (
            <LinhaNaoPlanejado
              valor={nao.valor}
              selecionada={selecionada === NAO_PLANEJADO}
              focada={focoAtual === NAO_PLANEJADO}
              apagada={!!juntando}
              alvo={sobre === NAO_PLANEJADO && podeSoltar(config, arrastado, NAO_PLANEJADO)}
              registrar={registrar(NAO_PLANEJADO)}
              onTocar={() => tocar(NAO_PLANEJADO)}
              onFocar={() => setFocada(NAO_PLANEJADO)}
            />
          )}
          {linhas.map((v) => (
            <LinhaCategoria
              key={v.linha.id}
              v={v}
              valor={valores.get(v.linha.id) ?? 0}
              cor={cor(v.linha.id, v.nivel)}
              mostrarTipo={!!mostrarTipo}
              focada={focoAtual === v.linha.id}
              selecionada={selecionada === v.linha.id}
              origem={juntando === v.linha.id}
              semArrastar={!!juntando || renomeando === v.linha.id}
              renomeando={renomeando === v.linha.id}
              registrar={registrar(v.linha.id)}
              onTocar={() => tocar(v.linha.id)}
              onFocar={() => setFocada(v.linha.id)}
              onAlternar={(tudo) => alternar(v.linha.id, tudo)}
              onMenu={(e) => abrirMenu(e, v.linha.id)}
              onRenomeado={(nome, teclado) => renomeado(v.linha.id, nome, teclado)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={nova}
          className="flex h-9 w-full items-center gap-1.5 rounded-lg pl-1 pr-2.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink max-lg:h-10"
        >
          <span className="size-6 shrink-0" aria-hidden />
          <Plus size={16} className="shrink-0" />
          Nova categoria
        </button>
      </div>

      {menu.menu}
      {modoJuntar.pergunta}
    </div>
  );
}

/** "Não planejado" no topo: abre os lançamentos; recebe itens arrastados do detalhe (tira a categoria deles). */
function LinhaNaoPlanejado({
  valor,
  selecionada,
  focada,
  apagada,
  alvo,
  registrar,
  onTocar,
  onFocar,
}: {
  valor: number;
  selecionada: boolean;
  focada: boolean;
  apagada: boolean;
  alvo: boolean;
  registrar: (el: HTMLDivElement | null) => void;
  onTocar: () => void;
  onFocar: () => void;
}) {
  const soltar = useDroppable({ id: NAO_PLANEJADO });
  return (
    <div
      ref={(el) => {
        soltar.setNodeRef(el);
        registrar(el);
      }}
      role="treeitem"
      aria-level={1}
      aria-selected={selecionada}
      tabIndex={focada ? 0 : -1}
      onClick={onTocar}
      onFocus={onFocar}
      className={`flex h-9 cursor-default select-none items-center gap-1.5 rounded-lg pl-1 pr-2.5 text-sm outline-none max-lg:h-10 ${
        alvo ? 'bg-accent-weak ring-2 ring-inset ring-accent' : selecionada ? 'bg-accent-weak' : 'hover:bg-surface-2 focus-visible:bg-surface-2'
      } ${apagada ? 'opacity-40' : ''}`}
    >
      <span className="size-6 shrink-0" aria-hidden />
      <TriangleAlert size={16} className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate font-medium">Não planejado</span>
      <span className="shrink-0 tabular">{brl0(valor)}</span>
    </div>
  );
}

function LinhaCategoria({
  v,
  valor,
  cor,
  mostrarTipo,
  focada,
  selecionada,
  origem,
  semArrastar,
  renomeando,
  registrar,
  onTocar,
  onFocar,
  onAlternar,
  onMenu,
  onRenomeado,
}: {
  v: LinhaVisivel;
  valor: number;
  cor: string;
  mostrarTipo: boolean;
  focada: boolean;
  selecionada: boolean;
  /** a que vai ser juntada (modo juntar) */
  origem: boolean;
  semArrastar: boolean;
  renomeando: boolean;
  registrar: (el: HTMLDivElement | null) => void;
  onTocar: () => void;
  onFocar: () => void;
  onAlternar: (tudoDentro: boolean) => void;
  onMenu: (e: MouseEventReact) => void;
  onRenomeado: (nome: string | null, teclado: boolean) => void;
}) {
  const { linha: l, nivel, temFilhas: pasta, aberta, vazia } = v;
  const arrastar = useCategoriaArrastavel(l, cor, semArrastar);
  return (
    <div
      ref={(el) => {
        arrastar.ref(el);
        registrar(el);
      }}
      {...arrastar.props}
      role="treeitem"
      aria-level={nivel + 1}
      aria-expanded={pasta ? aberta : undefined}
      aria-selected={selecionada}
      tabIndex={focada ? 0 : -1}
      onClick={onTocar}
      onFocus={onFocar}
      onContextMenu={onMenu}
      className={`flex h-9 cursor-default select-none items-center gap-1.5 rounded-lg pr-2.5 text-sm outline-none max-lg:h-10 ${
        arrastar.alvo || origem ? 'bg-accent-weak ring-2 ring-inset ring-accent' : selecionada ? 'bg-accent-weak' : 'hover:bg-surface-2 focus-visible:bg-surface-2'
      } ${arrastar.bloqueada || arrastar.arrastando ? 'opacity-40' : ''} ${vazia ? 'text-muted' : ''}`}
      style={{ paddingLeft: 4 + nivel * 18 }}
    >
      {pasta ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onAlternar(e.altKey);
          }}
          // no toque, a área de tocar é maior que o ícone (tocar no resto da linha abre o detalhe)
          className="relative flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
          aria-label={aberta ? `Fechar ${l.nome}` : `Abrir ${l.nome}`}
        >
          <ChevronRight size={15} className={`transition-transform ${aberta ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <span className="size-6 shrink-0" aria-hidden />
      )}
      <Folder size={16} className={`shrink-0 ${vazia ? 'opacity-50' : ''}`} style={{ color: cor }} fill="currentColor" fillOpacity={0.18} />
      {renomeando ? (
        <NomeNaLinha nome={l.nome} onFim={onRenomeado} />
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`min-w-0 truncate ${nivel === 0 && !vazia ? 'font-medium' : ''}`}>{l.nome}</span>
          {mostrarTipo && <EtiquetaTipo natureza={l.natureza} />}
        </span>
      )}
      {/* renomeando no celular, o campo fica com a largura do valor também */}
      <span className={`shrink-0 text-right tabular ${vazia ? '' : 'text-ink-2'} ${renomeando ? 'max-lg:hidden' : ''}`}>{vazia ? '—' : brl0(valor)}</span>
    </div>
  );
}

/** Nome editável na própria linha (como no Finder): Enter ou sair do campo salva, Esc cancela. */
function NomeNaLinha({ nome, onFim }: { nome: string; onFim: (nome: string | null, teclado: boolean) => void }) {
  const [texto, setTexto] = useState(nome);
  const ref = useRef<HTMLInputElement>(null);
  const feito = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    el.scrollIntoView({ block: 'nearest' });
  }, []);
  const fim = (valor: string | null, teclado: boolean) => {
    if (feito.current) return;
    feito.current = true;
    onFim(valor, teclado);
  };
  return (
    <input
      ref={ref}
      value={texto}
      aria-label="Nome da categoria"
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') fim(texto, true);
        else if (e.key === 'Escape') fim(null, true);
      }}
      onBlur={() => fim(texto, false)}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="-my-1 min-w-0 flex-1 select-text rounded-md border border-accent bg-page px-1.5 py-0.5 text-sm text-ink outline-none"
    />
  );
}
