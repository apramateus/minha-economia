// Importa fatura/extrato (CSV ou OFX) com prévia, categorias editáveis e regras novas.
import { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import { useDados } from '../lib/estado';
import { dataCurta } from '../lib/datas';
import { brl } from '../lib/formato';
import { contaEhCartao, decodificar, lerArquivo, montarPrevia, sugerirPadrao, type ArquivoLido } from '../lib/importar';
import { linhasDoCSV, type Mapeamento } from '../lib/importar/formatos';
import type { FonteReceita, Regra, Transacao } from '../lib/tipos';
import { FONTES, useContasTransacao } from '../lib/contas';
import { incluirRegra } from '../lib/categorias';
import { Ajuda, Botao, Campo, Folha, Seletor, classeInput } from './ui';

type Escolha = string; // 'linha:<id>' | 'nao' | 'transf' | 'fonte:<fonte>'

interface Ajuste {
  escolha?: Escolha;
  incluir?: boolean;
  lembrar?: boolean;
  padrao?: string;
}

function escolhaDe(t: Transacao): Escolha {
  if (t.tipo === 'transferencia') return 'transf';
  if (t.tipo === 'receita') return `fonte:${t.fonte ?? 'outros'}`;
  return t.linha ? `linha:${t.linha}` : 'nao';
}

function aplicar(t: Transacao, e: Escolha): Transacao {
  const { fonte: _f, ...base } = t;
  if (e === 'transf') return { ...base, tipo: 'transferencia', linha: null };
  if (e === 'nao') return { ...base, tipo: 'despesa', linha: null };
  if (e.startsWith('linha:')) return { ...base, tipo: 'despesa', linha: e.slice(6) };
  return { ...base, tipo: 'receita', linha: null, fonte: e.slice(6) as FonteReceita };
}

function regraDe(padrao: string, e: Escolha): Regra {
  if (e === 'transf') return { padrao, tipo: 'transferencia' };
  if (e.startsWith('linha:')) return { padrao, linha: e.slice(6) };
  if (e.startsWith('fonte:')) return { padrao, fonte: e.slice(6) as FonteReceita };
  return { padrao, tipo: 'despesa' };
}

export function Importar({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { dados, atualizar, aviso } = useDados();
  const contas = useContasTransacao();
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [lido, setLido] = useState<ArquivoLido | null>(null);
  const [conta, setConta] = useState('');
  const [mapa, setMapa] = useState<Partial<Mapeamento>>({});
  const [positivoGasto, setPositivoGasto] = useState(true);
  const [ajustes, setAjustes] = useState<Record<number, Ajuste>>({});
  const [erro, setErro] = useState('');

  const reiniciar = () => {
    setLido(null);
    setNomeArquivo('');
    setAjustes({});
    setErro('');
  };

  const abrirArquivo = async (f: File | undefined) => {
    if (!f) return;
    reiniciar();
    try {
      const texto = decodificar(new Uint8Array(await f.arrayBuffer()));
      const l = lerArquivo(texto, contas.map((c) => c.id));
      setNomeArquivo(f.name);
      setLido(l);
      const c = l.contaSugerida ?? contas[0]?.id ?? 'conta';
      setConta(c);
      setMapa(l.mapeamento ?? {});
      setPositivoGasto(l.formato === 'c6-fatura' || contaEhCartao(c));
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${(e as Error).message}`);
    }
  };

  const linhas = useMemo(() => {
    if (!lido) return null;
    if (lido.formato !== 'csv') return lido.linhas;
    if (mapa.data === undefined || mapa.descricao === undefined || mapa.valor === undefined || !lido.tabela) return null;
    return linhasDoCSV(lido.tabela, { ...(mapa as Mapeamento), positivoEhGasto: positivoGasto });
  }, [lido, mapa, positivoGasto]);

  // regras que você está criando nesta importação já valem para as outras linhas
  const regrasNovas = useMemo(
    () =>
      Object.values(ajustes)
        .filter((a) => a.lembrar && a.escolha && a.padrao?.trim())
        .map((a) => regraDe(a.padrao!.trim().toUpperCase(), a.escolha!)),
    [ajustes],
  );

  const previa = useMemo(
    () =>
      linhas ? montarPrevia(linhas, conta, [...regrasNovas, ...dados.regras], dados.config, dados.transacoes) : [],
    [linhas, conta, regrasNovas, dados.regras, dados.config, dados.transacoes],
  );

  // classificação só com as regras que já existiam (para saber o que você mudou à mão)
  const original = useMemo(
    () => (linhas ? montarPrevia(linhas, conta, dados.regras, dados.config, dados.transacoes) : []),
    [linhas, conta, dados.regras, dados.config, dados.transacoes],
  );

  const visiveis = previa.map((p, i) => ({ ...p, i })).filter((p) => !p.duplicada);
  const finais = visiveis.map((p) => {
    const a = ajustes[p.i] ?? {};
    const t = a.escolha ? { ...aplicar(p.transacao, a.escolha), editado: true } : p.transacao;
    return { ...p, t, incluir: a.incluir ?? !p.jaLancada, ajuste: a };
  });
  const aImportar = finais.filter((f) => f.incluir);
  const totalGastos = aImportar.filter((f) => f.t.tipo === 'despesa').reduce((s, f) => s + f.t.valor, 0);
  const semCategoria = aImportar.filter((f) => f.t.tipo === 'despesa' && !f.t.linha).length;

  const ajustar = (i: number, a: Ajuste) => setAjustes((x) => ({ ...x, [i]: { ...x[i], ...a } }));

  const confirmar = async () => {
    const novas = aImportar.map((f) => f.t);
    if (regrasNovas.length) {
      // a mesma loja com outra categoria: a regra nova substitui a antiga
      await atualizar('regras', (rs) => regrasNovas.reduceRight(incluirRegra, rs));
    }
    await atualizar('transacoes', (ts) => [...ts, ...novas].sort((a, b) => a.data.localeCompare(b.data)));
    aviso(`${novas.length} lançamentos importados`);
    reiniciar();
    onFechar();
  };

  const cabecalho = lido?.tabela?.[0] ?? [];
  const opcoesDespesa = dados.config.orcamento;

  return (
    <Folha aberta={aberta} titulo="Importar extrato ou fatura" onFechar={onFechar}>
      {!lido && (
        <>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-borda p-8 text-center active:bg-surface-2">
            <FileUp size={28} className="text-accent" />
            <span className="font-semibold">Escolher arquivo</span>
            <span className="flex items-center gap-1 text-sm text-muted">
              CSV ou OFX
              <Ajuda>Só tem o PDF? Ponha na pasta importar/ do projeto e peça ao Claude para importar: ele lê o PDF e grava com as mesmas regras.</Ajuda>
            </span>
            <input type="file" accept=".csv,.ofx,.txt,text/csv" className="hidden" onChange={(e) => abrirArquivo(e.target.files?.[0])} />
          </label>
          {erro && <p className="mt-3 text-sm text-critical">{erro}</p>}
        </>
      )}

      {lido && (
        <>
          <div className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="font-semibold">{nomeArquivo}</div>
            <div className="text-ink-2">
              {lido.formato === 'c6-fatura' ? 'Fatura do cartão' : lido.formato === 'ofx' ? 'Extrato OFX' : 'CSV'} ·{' '}
              {previa.length} linhas · {previa.filter((p) => p.duplicada).length} já importadas antes
            </div>
          </div>

          <Campo rotulo="Conta">
            <Seletor
              value={conta}
              onChange={(e) => {
                setConta(e.target.value);
                if (lido.formato === 'csv') setPositivoGasto(contaEhCartao(e.target.value));
              }}
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Seletor>
          </Campo>

          {lido.formato === 'csv' && (
            <div className="mb-3 rounded-xl border border-borda p-3">
              <div className="mb-2 text-xs font-semibold text-ink-2">Colunas</div>
              <div className="grid grid-cols-3 gap-2">
                {(['data', 'descricao', 'valor'] as const).map((k) => (
                  <label key={k} className="text-xs text-muted">
                    {k === 'descricao' ? 'Descrição' : k === 'data' ? 'Data' : 'Valor'}
                    <select
                      className={`${classeInput} mt-1 px-2 py-2`}
                      value={mapa[k] ?? ''}
                      onChange={(e) => setMapa((m) => ({ ...m, [k]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    >
                      <option value="">—</option>
                      {cabecalho.map((c, i) => (
                        <option key={i} value={i}>
                          {c || `coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm max-lg:mt-1 max-lg:min-h-10">
                <input type="checkbox" className="max-lg:size-5" checked={positivoGasto} onChange={(e) => setPositivoGasto(e.target.checked)} />
                Valores positivos são gastos (fatura de cartão)
              </label>
            </div>
          )}

          {linhas && (
            <>
              <ul className="mb-4 divide-y divide-borda rounded-xl border border-borda">
                {finais.map((f) => {
                  const esc = f.ajuste.escolha ?? escolhaDe(f.t);
                  const mudou = f.ajuste.escolha !== undefined && f.ajuste.escolha !== escolhaDe(original[f.i].transacao);
                  const entrada = f.transacao.tipo === 'receita';
                  return (
                    <li key={f.i} className={`p-3 ${f.incluir ? '' : 'opacity-50'}`}>
                      <div className="flex items-start gap-2">
                        {/* no celular, a caixa é maior e a área de toque passa de 40 px */}
                        <label className="flex max-lg:-m-2.5 max-lg:p-2.5">
                          <input
                            type="checkbox"
                            className="mt-1 max-lg:mt-0 max-lg:size-5"
                            checked={f.incluir}
                            onChange={(e) => ajustar(f.i, { incluir: e.target.checked })}
                            aria-label="Importar esta linha"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="truncate">
                              <span className="tabular text-muted">{dataCurta(f.t.data)}</span> {f.t.descricao}
                            </span>
                            <span className={`tabular shrink-0 font-semibold ${entrada ? 'text-good-text' : ''}`}>
                              {entrada ? '+' : ''}
                              {brl(f.t.valor)}
                            </span>
                          </div>
                          {f.jaLancada && (
                            <div className="mt-1 text-xs text-warning-text">
                              Já lançado à mão em {dataCurta(f.jaLancada.data)} · desmarcado
                            </div>
                          )}
                          <select
                            className={`${classeInput} mt-2 py-1.5 text-sm max-lg:py-2 ${esc === 'nao' ? 'border-warning' : ''}`}
                            value={esc}
                            onChange={(e) =>
                              ajustar(f.i, {
                                escolha: e.target.value,
                                lembrar: f.ajuste.lembrar ?? true,
                                padrao: f.ajuste.padrao ?? sugerirPadrao(f.t.descricao),
                              })
                            }
                          >
                            {entrada ? (
                              FONTES.map((x) => (
                                <option key={x.valor} value={`fonte:${x.valor}`}>
                                  Entrada · {x.rotulo}
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="nao">⚠ Não planejado</option>
                                {opcoesDespesa.map((l) => (
                                  <option key={l.id} value={`linha:${l.id}`}>
                                    {l.nome}
                                  </option>
                                ))}
                              </>
                            )}
                            <option value="transf">Transferência</option>
                          </select>
                          {mudou && (
                            <label className="mt-2 flex items-center gap-2 text-xs text-ink-2 max-lg:mt-1 max-lg:min-h-10">
                              <input
                                type="checkbox"
                                className="max-lg:size-5"
                                checked={f.ajuste.lembrar ?? true}
                                onChange={(e) => ajustar(f.i, { lembrar: e.target.checked })}
                              />
                              Lembrar para
                              <input
                                className="w-32 rounded-md border border-borda bg-page px-2 py-1 text-xs max-lg:py-1.5"
                                value={f.ajuste.padrao ?? ''}
                                onChange={(e) => ajustar(f.i, { padrao: e.target.value })}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {finais.length === 0 && <li className="p-4 text-center text-sm text-muted">Tudo neste arquivo já foi importado.</li>}
              </ul>

              <div className="mb-3 text-sm text-ink-2">
                {aImportar.length} lançamentos · {brl(totalGastos)} em gastos
                {semCategoria > 0 && <span className="text-warning-text"> · {semCategoria} sem categoria (não planejado)</span>}
              </div>
              <div className="flex gap-2">
                <Botao variante="secundario" onClick={reiniciar}>
                  Outro arquivo
                </Botao>
                <Botao className="flex-1" disabled={aImportar.length === 0} onClick={confirmar}>
                  Importar {aImportar.length}
                </Botao>
              </div>
            </>
          )}
          {!linhas && lido.formato === 'csv' && <p className="text-sm text-muted">Falta escolher as colunas.</p>}
        </>
      )}
    </Folha>
  );
}
