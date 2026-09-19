import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, HandCoins, Home, ListOrdered, Sparkles, Target, Wallet } from 'lucide-react';
import { isoMes } from './lib/datas';
import type { Transacao } from './lib/tipos';
import { Lancamento } from './components/Lancamento';
import { Importar } from './components/Importar';
import { Copiloto, LARGURA_MAX, LARGURA_MIN, LARGURA_PADRAO, type ContextoTela } from './components/Copiloto';
import { useComputador } from './components/ui';
import { useToqueLongo } from './components/Menu';
import { Painel } from './pages/Painel';
import { Extrato } from './pages/Extrato';
import { Orcamento } from './pages/Orcamento';
import { Metas } from './pages/Metas';
import { Gastos } from './pages/Gastos';
import { Patrimonio } from './pages/Patrimonio';
import { Celular } from './pages/Celular';
import { Categorizar } from './pages/Categorizar';
import { Custo } from './pages/Custo';
import { Dividas } from './pages/Dividas';

const ABAS = [
  { id: 'painel', rotulo: 'Início', Icone: Home },
  { id: 'gastos', rotulo: 'Gastos', Icone: BarChart3 },
  { id: 'extrato', rotulo: 'Extrato', Icone: ListOrdered },
  { id: 'orcamento', rotulo: 'Orçamento', Icone: Wallet },
  { id: 'metas', rotulo: 'Metas', Icone: Target },
  { id: 'dividas', rotulo: 'Dívidas', Icone: HandCoins },
] as const;
/** a barra de baixo do celular só tem espaço para estas (mais o Copiloto); Dívidas abre pelo Patrimônio */
const ABAS_CELULAR = ABAS.slice(0, 5);
/** páginas sem aba própria: Patrimônio e A categorizar abrem pelos cards do Início; Custo para viver pelo Orçamento */
const OUTRAS_ROTAS: Record<string, string> = {
  celular: 'Celular',
  categorizar: 'A categorizar',
  patrimonio: 'Patrimônio',
  custo: 'Custo para viver',
};
/** a aba que fica marcada nas páginas sem aba própria (as outras marcam o Início) */
const ABA_DE: Record<string, string> = { custo: 'orcamento' };

// computador: menu (224 px) + copiloto + conteúdo. O conteúdo não fica abaixo de MIN_CONTEUDO (a aba Gastos põe a lista,
// até 380 px, e o detalhe lado a lado); se nem o copiloto mínimo cabe ao lado do menu inteiro, o menu vira só ícones.
const MENU = 224;
const MENU_COMPACTO = 64;
const MIN_CONTEUDO = 780;

function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento local */
  }
}
const limitar = (px: number) => Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, px));

function useLarguraJanela() {
  const [largura, setLargura] = useState(() => window.innerWidth);
  useEffect(() => {
    const mudou = () => setLargura(window.innerWidth);
    window.addEventListener('resize', mudou);
    return () => window.removeEventListener('resize', mudou);
  }, []);
  return largura;
}

function lerRota() {
  const [bruto, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const caminho = bruto === 'categorias' ? 'gastos' : bruto; // a lista de categorias agora fica em Gastos
  const pagina = ABAS.some((a) => a.id === caminho) || caminho in OUTRAS_ROTAS ? caminho : 'painel';
  return { pagina, params: new URLSearchParams(query) };
}

export function App() {
  const [rota, setRota] = useState(lerRota);
  const [mes, setMes] = useState(isoMes());
  const [aberto, setAberto] = useState<Transacao | null>(null);
  const [importar, setImportar] = useState(false);
  const computador = useComputador();
  const janela = useLarguraJanela();
  useToqueLongo();
  // no computador o copiloto lembra se ficou aberto; no celular sempre começa fechado (é tela cheia)
  const [copiloto, setCopiloto] = useState(() => window.matchMedia('(min-width: 1024px)').matches && lerLocal('copiloto.aberto') === '1');
  const [larguraCopiloto, setLarguraCopiloto] = useState(() => limitar(Number(lerLocal('copiloto.largura')) || LARGURA_PADRAO));
  const [copilotoRodando, setCopilotoRodando] = useState(false);
  const fecharCopiloto = useCallback(() => setCopiloto(false), []);
  const mudarLargura = useCallback((px: number) => setLarguraCopiloto(limitar(px)), []);

  useEffect(() => {
    if (computador) gravarLocal('copiloto.aberto', copiloto ? '1' : '0');
  }, [copiloto, computador]);
  useEffect(() => {
    gravarLocal('copiloto.largura', String(larguraCopiloto));
  }, [larguraCopiloto]);
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setCopiloto((a) => !a);
      }
    };
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  const painelAberto = computador && copiloto;
  const menuCompacto = painelAberto && janela - MENU - MIN_CONTEUDO < LARGURA_MIN;
  const menu = menuCompacto ? MENU_COMPACTO : MENU;
  const painel = painelAberto ? Math.max(LARGURA_MIN, Math.min(larguraCopiloto, janela - menu - MIN_CONTEUDO)) : 0;
  // o que fica fixo na tela (ex.: os avisos) se centraliza no conteúdo, descontando o menu e o copiloto
  useEffect(() => {
    document.documentElement.style.setProperty('--margem-app', computador ? `${menu + painel}px` : '0px');
  }, [computador, menu, painel]);

  useEffect(() => {
    const mudou = () => {
      setRota(lerRota());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', mudou);
    return () => window.removeEventListener('hashchange', mudou);
  }, []);

  const navegar = useCallback((destino: string) => {
    window.location.hash = `/${destino}`;
  }, []);
  const fecharLancamento = useCallback(() => setAberto(null), []);
  const fecharImportar = useCallback(() => setImportar(false), []);

  const editar = (t: Transacao) => setAberto(t);

  const gastos = rota.pagina === 'gastos';
  // Início e Orçamento: duas colunas no computador, para caber na tela sem rolar
  const larga = rota.pagina === 'painel' || rota.pagina === 'orcamento';
  const abaAtiva = ABAS.some((a) => a.id === rota.pagina) ? rota.pagina : (rota.params.get('de') ?? ABA_DE[rota.pagina] ?? 'painel');
  // no celular, Dívidas (sem aba) fica debaixo do Início, como o Patrimônio
  const abaAtivaCelular = ABAS_CELULAR.some((a) => a.id === abaAtiva) ? abaAtiva : 'painel';
  const contexto = useMemo<ContextoTela>(
    () => ({
      tela: rota.pagina,
      rotulo: ABAS.find((a) => a.id === rota.pagina)?.rotulo ?? OUTRAS_ROTAS[rota.pagina] ?? rota.pagina,
      mes: ['extrato', 'orcamento'].includes(rota.pagina) ? mes : undefined,
    }),
    [rota.pagina, mes],
  );

  return (
    <div className="min-h-dvh">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-borda bg-surface py-6 lg:flex ${menuCompacto ? 'w-16 px-2' : 'w-56 px-3'}`}
        aria-label="Seções"
      >
        {!menuCompacto && <div className="px-3 pb-6 text-lg font-bold tracking-tight">Minha Economia</div>}
        <nav className="space-y-0.5">
          {ABAS.map(({ id, rotulo, Icone }) => {
            const ativo = abaAtiva === id;
            return (
              <a
                key={id}
                href={`#/${id}`}
                aria-current={ativo ? 'page' : undefined}
                aria-label={menuCompacto ? rotulo : undefined}
                title={menuCompacto ? rotulo : undefined}
                className={`flex items-center gap-3 rounded-xl py-2 text-sm font-medium ${menuCompacto ? 'justify-center' : 'px-3'} ${
                  ativo ? 'bg-accent-weak text-accent-strong' : 'text-ink-2 hover:bg-surface-2'
                }`}
              >
                <Icone size={18} strokeWidth={ativo ? 2.4 : 1.8} />
                {!menuCompacto && rotulo}
              </a>
            );
          })}
        </nav>
        <div className="mt-auto">
          <button
            onClick={() => setCopiloto((a) => !a)}
            aria-pressed={copiloto}
            aria-label="Copiloto"
            title={copiloto ? 'Recolher o copiloto (⌘J)' : 'Abrir o copiloto (⌘J)'}
            className={`relative flex w-full items-center gap-3 rounded-xl py-2 text-sm font-medium ${menuCompacto ? 'justify-center' : 'px-3'} ${
              copiloto ? 'bg-accent-weak text-accent-strong' : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            <Sparkles size={18} strokeWidth={copiloto ? 2.4 : 1.8} />
            {!menuCompacto && (
              <>
                Copiloto
                <kbd className="ml-auto font-sans text-xs font-normal text-muted">⌘J</kbd>
              </>
            )}
            {copilotoRodando && !copiloto && <span className="absolute left-7 top-1.5 size-2 animate-pulse rounded-full bg-accent" />}
          </button>
        </div>
      </aside>

      {/* no computador, o conteúdo anda para a direita com o copiloto aberto */}
      <div style={computador ? { paddingLeft: menu + painel } : undefined}>
        {/* a aba Gastos é um canvas: usa a largura toda e a altura da tela */}
        <div className={`mx-auto px-4 pt-safe ${gastos ? 'max-w-6xl lg:max-w-none lg:px-6' : `max-w-xl pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-16 ${larga ? 'lg:max-w-5xl' : 'lg:max-w-2xl'}`}`}>
          <main className="pt-5 lg:pt-8">
            {rota.pagina === 'painel' && <Painel navegar={navegar} />}
            {gastos && <Gastos key={rota.params.toString()} editar={editar} ver={rota.params.get('ver')} juntar={rota.params.get('juntar')} />}
            {rota.pagina === 'extrato' && (
              <Extrato mes={mes} setMes={setMes} filtroInicial={rota.params.get('filtro') ?? undefined} editar={editar} importar={() => setImportar(true)} navegar={navegar} />
            )}
            {rota.pagina === 'orcamento' && <Orcamento mes={mes} setMes={setMes} navegar={navegar} />}
            {rota.pagina === 'metas' && <Metas navegar={navegar} />}
            {rota.pagina === 'patrimonio' && <Patrimonio navegar={navegar} secao={rota.params.get('secao')} />}
            {rota.pagina === 'celular' && <Celular />}
            {rota.pagina === 'categorizar' && <Categorizar editar={editar} navegar={navegar} />}
            {rota.pagina === 'custo' && <Custo navegar={navegar} de={rota.params.get('de')} />}
            {rota.pagina === 'dividas' && <Dividas navegar={navegar} />}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-surface/95 pb-safe backdrop-blur lg:hidden" aria-label="Seções">
        <ul className="mx-auto flex max-w-xl">
          {ABAS_CELULAR.map(({ id, rotulo, Icone }) => {
            const ativo = !copiloto && abaAtivaCelular === id;
            return (
              <li key={id} className="flex-1">
                <a
                  href={`#/${id}`}
                  onClick={() => setCopiloto(false)}
                  aria-current={ativo ? 'page' : undefined}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-tight ${ativo ? 'text-accent-strong' : 'text-muted'}`}
                >
                  <Icone size={22} strokeWidth={ativo ? 2.4 : 1.8} />
                  {rotulo}
                </a>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setCopiloto((a) => !a)}
              aria-pressed={copiloto}
              className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-tight ${copiloto ? 'text-accent-strong' : 'text-muted'}`}
            >
              <Sparkles size={22} strokeWidth={copiloto ? 2.4 : 1.8} />
              Copiloto
              {copilotoRodando && !copiloto && <span className="absolute right-[calc(50%-0.9rem)] top-1.5 size-2 animate-pulse rounded-full bg-accent" />}
            </button>
          </li>
        </ul>
      </nav>

      <Lancamento aberta={aberto !== null} onFechar={fecharLancamento} editar={aberto} />
      <Importar aberta={importar} onFechar={fecharImportar} />
      <Copiloto
        aberto={copiloto}
        onFechar={fecharCopiloto}
        contexto={contexto}
        computador={computador}
        esquerda={menu}
        largura={painel || larguraCopiloto}
        onLargura={mudarLargura}
        onRodando={setCopilotoRodando}
      />
    </div>
  );
}
