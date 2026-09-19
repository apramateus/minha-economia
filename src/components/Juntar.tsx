// Juntar duas categorias numa lista (Gastos → Pastas e Custo para viver): "Juntar com…" põe a lista em modo "clique na
// outra"; clicada a outra, uma pergunta só, "Qual nome fica?". Age na hora e o aviso oferece Desfazer.
import { useEffect, useState } from 'react';
import { Check, Merge } from 'lucide-react';
import { useDados } from '../lib/estado';
import { NAO_PLANEJADO } from '../lib/analise';
import type { LinhaOrcamento } from '../lib/tipos';
import { useOperacoesCategorias } from './AcoesCategoria';
import { Botao, Entrada, Folha } from './ui';

/**
 * `juntando` = a categoria que vai ser juntada (null = fora do modo). Devolve a faixa do topo da lista ("Juntar X com…
 * Cancelar"), a pergunta do nome e `escolherOutra`, para o clique numa categoria enquanto está no modo. Esc cancela.
 */
export function useJuntar(juntando: string | null, onJuntando: (id: string | null) => void) {
  const { dados } = useDados();
  const { juntar } = useOperacoesCategorias();
  const [com, setCom] = useState<string | null>(null);
  const origem = juntando ? dados.config.orcamento.find((l) => l.id === juntando) : undefined;
  const alvo = com ? dados.config.orcamento.find((l) => l.id === com) : undefined;

  // mudou (ou saiu do) modo juntar: a pergunta de antes não vale mais
  useEffect(() => setCom(null), [juntando]);
  // a categoria sumiu (juntada ou excluída por outro caminho): sai do modo
  useEffect(() => {
    if (juntando && !origem) onJuntando(null);
  }, [juntando, origem, onJuntando]);
  // Esc cancela o modo juntar (com a pergunta aberta, o Esc só fecha a pergunta)
  useEffect(() => {
    if (!juntando || com) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement).tagName === 'INPUT') return;
      e.stopPropagation();
      onJuntando(null);
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [juntando, com, onJuntando]);

  const escolher = (outra: string, fica: string, nome?: string) => {
    setCom(null);
    onJuntando(null);
    juntar(outra, fica, nome);
  };

  return {
    escolherOutra: (id: string) => {
      if (id !== juntando && id !== NAO_PLANEJADO) setCom(id);
    },
    faixa: origem && (
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-borda bg-surface/95 py-1.5 pl-3 pr-1.5 text-sm backdrop-blur">
        <Merge size={15} className="shrink-0 text-accent-strong" />
        <span className="min-w-0 flex-1 truncate">
          Juntar <b className="font-semibold">{origem.nome}</b> com…
        </span>
        <button
          type="button"
          onClick={() => onJuntando(null)}
          className="shrink-0 rounded-lg px-2.5 py-1 font-semibold text-accent-strong hover:bg-surface-2 max-lg:py-2.5"
        >
          Cancelar
        </button>
      </div>
    ),
    pergunta: origem && alvo && (
      <PerguntaJuntar key={alvo.id} origem={origem} alvo={alvo} onEscolher={escolher} onFechar={() => setCom(null)} />
    ),
  };
}

/** "Qual nome fica?" ao juntar duas categorias. */
function PerguntaJuntar({
  origem,
  alvo,
  onEscolher,
  onFechar,
}: {
  origem: LinhaOrcamento;
  alvo: LinhaOrcamento;
  onEscolher: (outra: string, fica: string, nome?: string) => void;
  onFechar: () => void;
}) {
  const [outro, setOutro] = useState('');
  return (
    <Folha aberta titulo={`Juntar ${origem.nome} e ${alvo.nome}`} onFechar={onFechar}>
      <p className="mb-2 text-sm font-semibold text-ink-2">Qual nome fica?</p>
      <div className="grid gap-2">
        <Botao variante="secundario" onClick={() => onEscolher(alvo.id, origem.id)}>
          {origem.nome}
        </Botao>
        <Botao variante="secundario" onClick={() => onEscolher(origem.id, alvo.id)}>
          {alvo.nome}
        </Botao>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (outro.trim()) onEscolher(origem.id, alvo.id, outro.trim());
          }}
        >
          <Entrada value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="Outro nome" aria-label="Outro nome" className="min-w-0 flex-1" />
          <Botao type="submit" disabled={!outro.trim()}>
            <Check size={16} />
            <span className="sr-only">Juntar com esse nome</span>
          </Botao>
        </form>
      </div>
    </Folha>
  );
}
