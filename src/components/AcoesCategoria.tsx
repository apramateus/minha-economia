// Operações na árvore de categorias (lista de Gastos, detalhe, botão direito). Juntar, excluir e mudar a
// categoria de um lançamento agem na hora e o aviso oferece Desfazer.
import { useCallback } from 'react';
import { CornerLeftUp, FolderInput, FolderTree, List, Merge, Pencil, SquarePen, Trash2, TriangleAlert } from 'lucide-react';
import { useDados } from '../lib/estado';
import { reverter } from '../lib/mescla';
import { criar, editar, excluir, juntar, mover, NATUREZAS, nomeLivre, paiDe, type DadosCategorias, type ResultadoCategorias } from '../lib/categorias';
import type { Config, LinhaOrcamento, Natureza, Transacao } from '../lib/tipos';
import { itensDeCategorias, veioDoToque, type ItemMenu } from './Menu';
import { IconeComportamento } from './ui';

/** Nome com recuo, para os seletores em árvore. */
export const rotuloArvore = (p: { nome: string; nivel: number }) => `${'   '.repeat(Math.max(0, p.nivel - 1))}${p.nome}`;

export function useOperacoesCategorias() {
  const { dados, atualizar, aviso } = useDados();

  /** Desfaz só o que a operação mudou: o que chegou depois (uma sincronização, o outro aparelho) continua. */
  const desfazerPara = (antes: DadosCategorias, depois: ResultadoCategorias) => ({
    rotulo: 'Desfazer',
    fazer: async () => {
      await atualizar('transacoes', reverter(antes.transacoes, depois.transacoes));
      await atualizar('regras', reverter(antes.regras, depois.regras));
      await atualizar('config', reverter(antes.config, depois.config));
      aviso('Desfeito');
    },
  });

  /** Operação que mexe em config, lançamentos e regras. Valida antes de gravar qualquer coisa. */
  const nosTres = async (op: (d: DadosCategorias) => ResultadoCategorias, msg: string) => {
    const antes = { config: dados.config, transacoes: dados.transacoes, regras: dados.regras };
    try {
      const depois = op(dados);
      await atualizar('transacoes', (ts) => op({ ...dados, transacoes: ts }).transacoes);
      await atualizar('regras', (rs) => op({ ...dados, regras: rs }).regras);
      await atualizar('config', (c) => op({ ...dados, config: c }).config);
      aviso(msg, 'ok', desfazerPara(antes, depois));
      return true;
    } catch (e) {
      aviso((e as Error).message, 'erro');
      return false;
    }
  };

  /** Mudança só no config. Sem `msg`, grava quieto (ex.: o detalhe salvando sozinho). */
  const soConfig = async (fn: (c: Config) => Config, msg?: string) => {
    try {
      fn(dados.config);
      await atualizar('config', fn);
      if (msg) aviso(msg);
      return true;
    } catch (e) {
      aviso((e as Error).message, 'erro');
      return false;
    }
  };

  const nome = (id: string) => dados.config.orcamento.find((l) => l.id === id)?.nome ?? '';

  return {
    nosTres,
    soConfig,

    /** Põe dentro de outra (null = nível principal). */
    mover: (id: string, destino: string | null) =>
      soConfig((c) => mover(c, [id], destino), destino ? `${nome(id)} agora está dentro de ${nome(destino)}` : `${nome(id)} foi para o nível principal`),

    /** Cria no nível principal com um nome livre; devolve o id. */
    criar: async (natureza: Natureza, pai: string | null = null) => {
      const r = criar(dados.config, nomeLivre(dados.config, 'Nova categoria'), natureza, pai);
      return (await soConfig(() => r.config)) ? r.id : null;
    },

    /** Muda nome, plano, tipo ou nota, sem aviso. O id nunca muda: quem está com a categoria aberta continua com ela. */
    editar: (id: string, campos: Partial<Pick<LinhaOrcamento, 'nome' | 'valor' | 'natureza' | 'nota'>>) => soConfig((c) => editar(c, id, campos)),

    /** Junta `outra` em `fica`; `novoNome` renomeia a que fica. */
    juntar: (outra: string, fica: string, novoNome?: string) =>
      nosTres((d) => juntar(d, outra, fica, novoNome), `Agora é tudo ${novoNome?.trim() || nome(fica)}`),

    /** Exclui: os lançamentos vão para a categoria de cima (ou voltam para "a categorizar"). */
    excluir: (id: string) => {
      const l = dados.config.orcamento.find((x) => x.id === id);
      if (!l) return Promise.resolve(false);
      const pai = paiDe(dados.config, l);
      const n = dados.transacoes.filter((t) => t.linha === id).length;
      const onde = n ? (pai ? ` · ${n} lançamento${n === 1 ? '' : 's'} foram para ${nome(pai)}` : ` · ${n} lançamento${n === 1 ? '' : 's'} sem categoria`) : '';
      return nosTres((d) => excluir(d, [id], pai), `${l.nome} excluída${onde}`);
    },

    /** Muda a categoria de lançamentos (null = não planejado). Marca como editado: o banco não muda mais. */
    recategorizar: async (ids: string[], linha: string | null) => {
      const antes = dados.transacoes;
      const s = new Set(ids);
      await atualizar('transacoes', (ts) => ts.map((t) => (s.has(t.id) ? { ...t, linha, editado: true } : t)));
      aviso(`${ids.length === 1 ? 'Agora' : `${ids.length} lançamentos agora`} em ${linha ? nome(linha) : 'não planejado'}`, 'ok', {
        rotulo: 'Desfazer',
        fazer: async () => {
          const velhos = new Map(antes.filter((t) => s.has(t.id)).map((t) => [t.id, t]));
          await atualizar('transacoes', (ts) => ts.map((t) => velhos.get(t.id) ?? t));
          aviso('Desfeito');
        },
      });
    },
  };
}

/** Itens do botão direito numa categoria. `onRenomear` decide onde o nome é editado (na linha, no detalhe…). */
export function useMenuDaCategoria({
  onAbrir,
  onRenomear,
  onJuntar,
}: {
  onAbrir: (id: string) => void;
  onRenomear: (id: string) => void;
  onJuntar: (id: string) => void;
}) {
  const { dados } = useDados();
  const ops = useOperacoesCategorias();
  return (id: string): ItemMenu[] => {
    const l = dados.config.orcamento.find((x) => x.id === id);
    if (!l) return [];
    const idPai = paiDe(dados.config, l);
    const pai = idPai ? dados.config.orcamento.find((x) => x.id === idPai) : undefined;
    return [
      { id: 'abrir', rotulo: 'Ver mais', icone: <List size={15} />, onEscolher: () => onAbrir(id) },
      { id: 'renomear', rotulo: 'Renomear', icone: <Pencil size={15} />, onEscolher: () => onRenomear(id) },
      ...(pai
        ? [{ id: 'sair', rotulo: `Tirar de ${pai.nome}`, icone: <CornerLeftUp size={15} />, onEscolher: () => ops.mover(id, paiDe(dados.config, pai)) }]
        : []),
      // no toque não há arrastar para dentro de outra: escolhe-se o lugar numa árvore
      ...(veioDoToque()
        ? [
            {
              id: 'mover',
              rotulo: 'Mover para',
              icone: <FolderTree size={15} />,
              submenu: (): ItemMenu[] => [
                ...(idPai
                  ? [{ id: '_topo', rotulo: 'Nível principal', separador: true, onEscolher: () => ops.mover(id, null) }]
                  : []),
                ...itensDeCategorias(dados.config, idPai, (d) => d !== idPai && ops.mover(id, d), null, id),
              ],
            },
          ]
        : []),
      {
        id: 'tipo',
        rotulo: 'Comportamento',
        icone: <IconeComportamento natureza={l.natureza} size={15} />,
        dica: NATUREZAS.find((n) => n.id === l.natureza)?.nome,
        submenu: () =>
          NATUREZAS.map((n) => ({
            id: n.id,
            rotulo: n.nome,
            icone: <IconeComportamento natureza={n.id} size={15} />,
            marcado: n.id === l.natureza,
            onEscolher: () => ops.editar(id, { natureza: n.id }),
          })),
      },
      { id: 'juntar', rotulo: 'Juntar com…', icone: <Merge size={15} />, separador: true, onEscolher: () => onJuntar(id) },
      { id: 'excluir', rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onEscolher: () => ops.excluir(id) },
    ];
  };
}

/** Itens do botão direito num lançamento: mudar a categoria (árvore em cascata) e abrir para editar. */
export function useMenuDoLancamento(editarLancamento: (t: Transacao) => void) {
  const { dados } = useDados();
  const { recategorizar } = useOperacoesCategorias();
  return useCallback(
    (t: Transacao): ItemMenu[] => [
      ...(t.tipo === 'despesa'
        ? [
            {
              id: 'categoria',
              rotulo: 'Categoria',
              icone: <FolderInput size={15} />,
              submenu: (): ItemMenu[] => [
                {
                  id: '_nao',
                  rotulo: 'Não planejado',
                  icone: <TriangleAlert size={14} />,
                  separador: true,
                  marcado: !dados.config.orcamento.some((l) => l.id === t.linha),
                  onEscolher: () => recategorizar([t.id], null),
                },
                ...itensDeCategorias(dados.config, t.linha, (id) => recategorizar([t.id], id)),
              ],
            },
          ]
        : []),
      { id: 'editar', rotulo: 'Abrir…', icone: <SquarePen size={15} />, onEscolher: () => editarLancamento(t) },
    ],
    [dados.config, recategorizar, editarLancamento],
  );
}
