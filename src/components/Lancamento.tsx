// Folha de um lançamento que já existe: só leitura (o que o banco disse) + a categoria.
import { useEffect, useState } from 'react';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { useDados } from '../lib/estado';
import { nomeMesLongo } from '../lib/datas';
import { brl } from '../lib/formato';
import type { Transacao } from '../lib/tipos';
import { FONTES, useContasTransacao } from '../lib/contas';
import { idDeCategoria, incluirRegra, parecidas, regraDoLancamento } from '../lib/categorias';
import { sugerirPadrao } from '../lib/importar';
import { SeletorCategoria } from './SeletorCategoria';
import { Botao, Chip, Entrada, Folha } from './ui';

/** Abrir um lançamento que já existe (Extrato, A categorizar, detalhe da categoria). */
export function Lancamento({ aberta, onFechar, editar }: { aberta: boolean; onFechar: () => void; editar: Transacao | null }) {
  return editar ? <FolhaDoLancamento aberta={aberta} onFechar={onFechar} original={editar} /> : null;
}

// ---------- Abrir um lançamento: o que o banco disse fica como está; só a categoria muda ----------

type Destino = Pick<Transacao, 'tipo' | 'linha' | 'fonte'>;

const chaveDe = (d: Destino) => (d.tipo === 'despesa' ? `d:${d.linha ?? ''}` : d.tipo === 'receita' ? `r:${d.fonte ?? ''}` : 't');

const dataPorExtenso = (dia: string) => `${Number(dia.slice(8, 10))} de ${nomeMesLongo(dia.slice(0, 7))}`;

function FolhaDoLancamento({ aberta, onFechar, original }: { aberta: boolean; onFechar: () => void; original: Transacao }) {
  const { dados, atualizar, aviso } = useDados();
  const contas = useContasTransacao();
  const [padrao, setPadrao] = useState('');
  /** destino (chaveDe) que já virou regra: a linha "Lembrar" some até mudar de novo */
  const [lembrado, setLembrado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nomeNova, setNomeNova] = useState('');

  useEffect(() => {
    if (!aberta) return;
    setPadrao(original.origem !== 'manual' ? sugerirPadrao(original.descricao) : '');
    setLembrado(null);
    setCriando(false);
    setNomeNova('');
  }, [aberta, original]);

  // cada escolha já grava: a versão atual é a dos dados
  const t = dados.transacoes.find((x) => x.id === original.id) ?? original;
  const config = dados.config;
  const entrada = original.tipo === 'receita';
  const nomeConta =
    contas.find((c) => c.id === t.conta)?.nome ?? dados.patrimonio.contas.find((c) => c.id === t.conta)?.nome ?? t.conta;
  const nomeDestino = (d: Destino) =>
    d.tipo === 'transferencia'
      ? 'Transferência'
      : d.tipo === 'receita'
        ? (FONTES.find((f) => f.valor === d.fonte)?.rotulo ?? 'Entrada')
        : d.linha
          ? (config.orcamento.find((l) => l.id === d.linha)?.nome ?? d.linha)
          : 'Não planejado';

  const escolher = async (d: Destino) => {
    setCriando(false);
    if (chaveDe(d) === chaveDe(t)) return;
    const antes = t;
    const mudar = (x: Transacao): Transacao => {
      const nova: Transacao = { ...x, tipo: d.tipo, linha: d.tipo === 'despesa' ? (d.linha ?? null) : null };
      if (d.tipo === 'receita') nova.fonte = d.fonte;
      else delete nova.fonte;
      if (x.origem !== 'manual') nova.editado = true;
      return nova;
    };
    await atualizar('transacoes', (ts) => ts.map((x) => (x.id === antes.id ? mudar(x) : x)));
    const texto = d.tipo === 'transferencia' ? 'Agora é transferência' : `Agora em ${d.tipo === 'despesa' && !d.linha ? 'não planejado' : nomeDestino(d)}`;
    aviso(texto, 'ok', {
      rotulo: 'Desfazer',
      fazer: async () => {
        await atualizar('transacoes', (ts) => ts.map((x) => (x.id === antes.id ? antes : x)));
        aviso('Desfeito');
      },
    });
  };

  const criarCategoria = async () => {
    const nome = nomeNova.trim();
    if (!nome) return;
    const id = idDeCategoria(nome, config.orcamento);
    await atualizar('config', (c) => ({ ...c, orcamento: [...c.orcamento, { id, nome, valor: 0, natureza: 'flexivel', pai: null }] }));
    setNomeNova('');
    await escolher({ tipo: 'despesa', linha: id });
  };

  // lembrar da próxima vez: só para o que veio do banco, depois de mudar o destino
  const mudou = chaveDe(t) !== chaveDe(original);
  const lembravel = t.tipo === 'transferencia' || (t.tipo === 'receita' ? !!t.fonte : !!t.linha);
  const mostrarLembrar = original.origem !== 'manual' && mudou && lembravel && lembrado !== chaveDe(t);

  const lembrar = async () => {
    const regra = regraDoLancamento(padrao, t);
    if (!regra) return;
    const regrasAntes = dados.regras;
    const outras = parecidas(dados.transacoes, regra, config, t.id);
    const trocar = new Map(outras.map((x) => [x.id, x]));
    const antes = new Map(dados.transacoes.filter((x) => trocar.has(x.id)).map((x) => [x.id, x]));
    await atualizar('regras', (rs) => incluirRegra(rs, regra));
    if (trocar.size) await atualizar('transacoes', (ts) => ts.map((x) => trocar.get(x.id) ?? x));
    setLembrado(chaveDe(t));
    const n = trocar.size;
    aviso(`Vou lembrar${n ? ` · +${n} parecido${n > 1 ? 's' : ''}` : ''}`, 'ok', {
      rotulo: 'Desfazer',
      fazer: async () => {
        await atualizar('regras', () => regrasAntes);
        if (antes.size) await atualizar('transacoes', (ts) => ts.map((x) => antes.get(x.id) ?? x));
        setLembrado(null);
        aviso('Desfeito');
      },
    });
  };

  const estorno = t.tipo === 'despesa' && t.valor < 0;

  return (
    <Folha aberta={aberta} titulo={t.descricao} onFechar={onFechar}>
      <div className="mb-5">
        <div
          className={`tabular text-3xl font-bold ${t.tipo === 'receita' ? 'text-good-text' : t.tipo === 'transferencia' ? 'text-muted' : ''}`}
        >
          {t.tipo === 'receita' || estorno ? '+' : t.tipo === 'despesa' ? '−' : ''}
          {brl(Math.abs(t.valor))}
          {estorno && <span className="ml-2 text-base font-semibold text-muted">estorno</span>}
        </div>
        <div className="mt-1 text-sm text-muted">
          {dataPorExtenso(t.data)} · {nomeConta}
        </div>
      </div>

      {entrada ? (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold text-ink-2">De onde veio</div>
          <div className="flex flex-wrap gap-2">
            {FONTES.map((f) => (
              <Chip key={f.valor} ativo={t.tipo === 'receita' && t.fonte === f.valor} onClick={() => escolher({ tipo: 'receita', linha: null, fonte: f.valor })}>
                {f.rotulo}
              </Chip>
            ))}
            <Chip ativo={t.tipo === 'transferencia'} onClick={() => escolher({ tipo: 'transferencia', linha: null })}>
              Transferência
            </Chip>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold text-ink-2">Categoria</div>
          <SeletorCategoria
            valor={t.tipo === 'despesa' ? (t.linha ?? null) : undefined}
            onEscolher={(id) => escolher({ tipo: 'despesa', linha: id })}
            rotulo={t.tipo === 'transferencia' ? 'Transferência' : undefined}
            extras={[
              {
                id: 'transferencia',
                rotulo: 'Transferência',
                icone: <ArrowLeftRight size={14} />,
                marcado: t.tipo === 'transferencia',
                onEscolher: () => escolher({ tipo: 'transferencia', linha: null }),
              },
              { id: 'nova', rotulo: 'Nova categoria…', icone: <Plus size={14} />, onEscolher: () => setCriando(true) },
            ]}
          />
          {criando && (
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                criarCategoria();
              }}
            >
              <Entrada
                autoFocus
                value={nomeNova}
                onChange={(e) => setNomeNova(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  e.stopPropagation(); // Esc aqui cancela a categoria nova, não fecha a folha
                  setCriando(false);
                  setNomeNova('');
                }}
                placeholder="Nome da categoria nova"
                aria-label="Nome da categoria nova"
                enterKeyHint="done"
              />
            </form>
          )}
        </div>
      )}

      {mostrarLembrar && (
        <form
          className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-2 p-3 text-sm text-ink-2"
          onSubmit={(e) => {
            e.preventDefault();
            lembrar();
          }}
        >
          Tudo com
          <input
            className="w-40 rounded-md border border-borda bg-page px-2 py-1 text-xs uppercase text-ink max-lg:py-1.5"
            value={padrao}
            onChange={(e) => setPadrao(e.target.value)}
            aria-label="Texto que identifica este lançamento"
          />
          vai para <strong className="text-ink">{nomeDestino(t)}</strong>
          <Botao type="submit" disabled={!regraDoLancamento(padrao, t)} className="ml-auto">
            Lembrar
          </Botao>
        </form>
      )}
    </Folha>
  );
}
