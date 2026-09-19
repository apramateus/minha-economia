// Escolher a categoria: um botão como o de um select mostrando a escolhida ("Casa › Luz"); clicar abre um menu com a
// árvore, e as categorias com outras dentro abrem em cascata ao passar o mouse (no toque, descem nível por nível).
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Folder, TriangleAlert } from 'lucide-react';
import { useDados } from '../lib/estado';
import { caminho } from '../lib/categorias';
import { ramoDe } from '../lib/fluxo';
import { corDoNo } from './fluxo/FluxoGastos';
import { ancoraAbaixo, itensDeCategorias, MenuFlutuante, type Ancora, type ItemMenu } from './Menu';

export function SeletorCategoria({
  valor,
  onEscolher,
  extras,
  semNaoPlanejado,
  rotulo,
  compacto,
  className = '',
}: {
  /** categoria escolhida (id); null = não planejado; undefined = nenhuma ainda */
  valor: string | null | undefined;
  /** id da categoria, ou null = não planejado */
  onEscolher: (id: string | null) => void;
  /** itens a mais no fim do menu (ex.: Transferência, + Nova categoria) */
  extras?: ItemMenu[];
  semNaoPlanejado?: boolean;
  /** o que o botão mostra quando a escolha não é uma categoria (ex.: "Transferência") */
  rotulo?: ReactNode;
  /** botão pequeno, sem borda (para ficar dentro de uma linha de lista) */
  compacto?: boolean;
  className?: string;
}) {
  const { dados } = useDados();
  const config = dados.config;
  const [aberto, setAberto] = useState<{ ancora: Ancora; modo: 'mouse' | 'toque' } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const ponteiro = useRef<'mouse' | 'toque'>('mouse');
  const fechar = useCallback(() => setAberto(null), []);

  const existe = !!valor && config.orcamento.some((l) => l.id === valor);
  const itens = useMemo<ItemMenu[]>(
    () => [
      ...(semNaoPlanejado
        ? []
        : [{ id: '_nao', rotulo: 'Não planejado', icone: <TriangleAlert size={14} />, separador: true, marcado: valor === null, onEscolher: () => onEscolher(null) }]),
      ...itensDeCategorias(config, valor, (id) => onEscolher(id)),
      ...(extras ?? []).map((x, i) => (i === 0 ? { ...x, separadorAntes: true } : x)),
    ],
    [config, valor, onEscolher, extras, semNaoPlanejado],
  );

  let conteudo: ReactNode;
  if (rotulo) conteudo = rotulo;
  else if (existe) {
    const trilha = caminho(config, valor!);
    conteudo = (
      <>
        <Folder
          size={compacto ? 13 : 15}
          className="shrink-0"
          style={{ color: corDoNo({ ramo: ramoDe(config, valor!), profundidade: trilha.length }) }}
          fill="currentColor"
          fillOpacity={0.18}
        />
        <span className="min-w-0 truncate">{(compacto ? trilha.slice(-1) : trilha).map((l) => l.nome).join(' › ')}</span>
      </>
    );
  } else if (valor === null)
    conteudo = (
      <>
        <TriangleAlert size={compacto ? 12 : 14} className="shrink-0 text-warning" />
        <span className="truncate">Não planejado</span>
      </>
    );
  else conteudo = <span className="text-muted">Escolha a categoria</span>;

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!aberto}
        onPointerDown={(e) => (ponteiro.current = e.pointerType === 'mouse' ? 'mouse' : 'toque')}
        onClick={(e) => {
          e.stopPropagation();
          if (aberto) fechar();
          else setAberto({ ancora: ancoraAbaixo(e.currentTarget), modo: ponteiro.current });
        }}
        className={
          compacto
            ? `flex min-w-0 max-w-44 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-ink-2 hover:bg-surface-2 ${aberto ? 'bg-surface-2' : ''} ${className}`
            : `flex min-h-10 w-full items-center gap-2 rounded-xl border bg-page px-3 text-left text-sm ${aberto ? 'border-accent' : 'border-borda hover:border-muted'} ${className}`
        }
      >
        {conteudo}
        <ChevronDown size={compacto ? 12 : 15} className={`shrink-0 text-muted transition-transform ${compacto ? '' : 'ml-auto'} ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && <MenuFlutuante itens={itens} ancora={aberto.ancora} modo={aberto.modo} titulo="Categorias" onFechar={fechar} ignorar={botao} />}
    </>
  );
}
