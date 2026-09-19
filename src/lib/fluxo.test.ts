import { describe, expect, it } from 'vitest';
import configFixture from './__fixtures__/config.json';
import type { Config, Transacao } from './tipos';
import { mover } from './categorias';
import { gastoNaArvore, NAO_PLANEJADO } from './analise';
import { arvoreDeGastos, ramoDe, enquadrar, layoutFluxo, linhasDeRotulo, noNoPonto, nosEmOrdem, trilhaDoNo, type NoFluxo } from './fluxo';

const config = configFixture as Config;
let n = 0;
const t = (data: string, valor: number, linha: string | null): Transacao => ({
  id: String(n++),
  data,
  valor,
  tipo: 'despesa',
  linha,
  descricao: 'X',
  conta: 'cartao',
  origem: 'import',
});
const p = { de: '2026-08-01', ate: '2026-08-31' };
const ts = [
  t('2026-08-01', 1500, 'aluguel'),
  t('2026-08-05', 99.9, 'internet'),
  t('2026-08-06', 26.3, 'luz'),
  t('2026-08-07', 500, 'ifood'),
  t('2026-08-08', 700, 'lazer'),
  t('2026-08-09', 40, null),
  t('2026-07-09', 999, 'aluguel'), // fora do período
];
const resumo = (n: NoFluxo): unknown => [n.id, n.valor, ...(n.filhos.length ? [n.filhos.map(resumo)] : [])];

describe('árvore de gastos', () => {
  it('filtro por tipo: só o gasto das categorias do tipo; sem não planejado; a lista soma igual ao diagrama', () => {
    const fixo = arvoreDeGastos(config, ts, p, 'fixo');
    expect(fixo.filhos.map(resumo)).toEqual([['casa', 1626.2, [['aluguel', 1500], ['contas-da-casa', 126.2, [['internet', 99.9], ['luz', 26.3]]]]]]);
    const flex = arvoreDeGastos(config, ts, p, 'flexivel');
    expect(flex.filhos.map((f) => f.id)).toEqual(['lazer', 'comida']);
    const lista = gastoNaArvore(config, ts, p);
    expect([lista.get('casa')?.valor, lista.get('contas-da-casa')?.valor, lista.get(NAO_PLANEJADO)?.valor]).toEqual([1626.2, 126.2, 40]);
    expect(gastoNaArvore(config, ts, p, 'fixo').get(NAO_PLANEJADO)).toBeUndefined();
    expect(gastoNaArvore(config, ts, p, 'flexivel').get('casa')).toBeUndefined();
    for (const nat of [null, 'fixo', 'flexivel'] as const) {
      const r = arvoreDeGastos(config, ts, p, nat);
      const g = gastoNaArvore(config, ts, p, nat);
      for (const f of r.filhos) expect(g.get(f.categoria ?? NAO_PLANEJADO)?.valor).toBe(f.valor);
    }
  });

  it('cor do ramo: a posição da categoria principal, igual para as de dentro', () => {
    expect(ramoDe(config, 'luz')).toBe(ramoDe(config, 'casa'));
    expect(ramoDe(config, 'casa')).toBe(0);
    expect(ramoDe(config, 'nao-existe')).toBe(-1);
  });

  it('cada categoria soma o que está dentro; não planejado em cima; categoria sem gasto sai', () => {
    const raiz = arvoreDeGastos(config, ts, p);
    expect(raiz.valor).toBe(2866.2);
    expect(raiz.filhos.map(resumo)).toEqual([
      [NAO_PLANEJADO, 40],
      ['casa', 1626.2, [['aluguel', 1500], ['contas-da-casa', 126.2, [['internet', 99.9], ['luz', 26.3]]]]],
      ['lazer', 700],
      ['comida', 500, [['ifood', 500]]],
    ]);
    const luz = nosEmOrdem(raiz).find((x) => x.id === 'luz')!;
    expect(luz).toMatchObject({ linha: 'luz', profundidade: 3, plano: 100 });
    // mesma cor para todo o ramo, pela posição na config (Casa é a 1ª categoria do nível de cima)
    expect(luz.ramo).toBe(raiz.filhos[1].ramo);
  });

  it('o lançado direto numa categoria de cima vira a folha "(geral)"', () => {
    const c = mover(config, ['ifood'], 'restaurante');
    const raiz = arvoreDeGastos(c, [...ts, t('2026-08-10', 300, 'restaurante'), t('2026-08-11', 25, 'comida')], p);
    const comida = raiz.filhos.find((x) => x.id === 'comida')!;
    expect(resumo(comida)).toEqual([
      'comida',
      825,
      [
        ['restaurante', 800, [['ifood', 500], ['restaurante#geral', 300]]],
        ['comida#geral', 25],
      ],
    ]);
    const geral = comida.filhos[1];
    expect(geral).toMatchObject({ nome: 'Comida (geral)', linha: 'comida', tipo: 'geral' });
  });

  it('ciclo em "pai" (arquivo editado à mão) não trava', () => {
    const c = { ...config, orcamento: config.orcamento.map((l) => (l.id === 'casa' ? { ...l, pai: 'aluguel' } : l.id === 'aluguel' ? { ...l, pai: 'casa' } : l)) };
    expect(() => arvoreDeGastos(c, ts, p)).not.toThrow();
  });
});

describe('layout do fluxo', () => {
  const raiz = arvoreDeGastos(config, ts, p);
  const o = { larguraColuna: 200, larguraNo: 10, larguraRaiz: 90, alturaTotal: 600 };
  const l = layoutFluxo(raiz, o);

  it('uma coluna por nível; o bloco GASTOS tem a altura total', () => {
    const r = l.porId.get('_total')!;
    expect([r.x0, r.x1, r.y1 - r.y0]).toEqual([0, 90, 600]);
    expect(l.porId.get('casa')!.x0).toBe(290);
    expect(l.porId.get('contas-da-casa')!.x0).toBe(500);
    expect(l.porId.get('luz')!.x0).toBe(710);
  });

  it('nada se sobrepõe numa coluna, e cada ramo fica dentro da faixa do pai', () => {
    const colunas = new Map<number, typeof l.nos>();
    for (const q of l.nos) colunas.set(q.x0, [...(colunas.get(q.x0) ?? []), q]);
    for (const col of colunas.values()) {
      const ordem = [...col].sort((a, b) => a.faixaY0 - b.faixaY0);
      for (let i = 1; i < ordem.length; i++) expect(ordem[i].faixaY0).toBeGreaterThanOrEqual(ordem[i - 1].faixaY1 - 1e-9);
    }
    for (const q of l.nos)
      for (const f of q.filhos) {
        expect(f.faixaY0).toBeGreaterThanOrEqual(q.faixaY0 - 1e-9);
        expect(f.faixaY1).toBeLessThanOrEqual(q.faixaY1 + 1e-9);
      }
  });

  it('as fitas de um pai somam a altura dele e saem empilhadas, sem buraco', () => {
    const casa = l.porId.get('casa')!;
    const saindo = l.fitas.filter((f) => f.de === casa);
    expect(saindo.reduce((s, f) => s + f.t, 0)).toBeCloseTo(casa.y1 - casa.y0, 6);
    expect(saindo[0].sy0).toBeCloseTo(casa.y0, 6);
    expect(saindo[1].sy0).toBeCloseTo(saindo[0].sy0 + saindo[0].t, 6);
    // a chegada fica centrada na barra do filho
    const f = saindo[0];
    expect(f.ty0 + f.t / 2).toBeCloseTo((f.para.y0 + f.para.y1) / 2, 6);
  });

  it('barra mínima para o que é pequeno', () => {
    const minusculo = layoutFluxo(arvoreDeGastos(config, [...ts, t('2026-08-12', 0.5, 'celular')], p), { ...o, hMin: 3 });
    const cel = minusculo.porId.get('celular')!;
    expect(cel.y1 - cel.y0).toBe(3);
  });

  it('sem gastos: layout vazio', () => {
    expect(layoutFluxo(arvoreDeGastos(config, [], p), o).nos).toEqual([]);
  });

  it('tocar: acha a barra (mesmo fina) ou a fita que leva a ela', () => {
    const luz = l.porId.get('luz')!;
    expect(noNoPonto(l, luz.x0 + 2, (luz.y0 + luz.y1) / 2 + 3, 16)?.no.id).toBe('luz');
    const f = l.fitas.find((x) => x.para.no.id === 'lazer')!;
    expect(noNoPonto(l, f.de.x1 + 20, f.sy0 + f.t / 2, 4)?.no.id).toBe('lazer');
    expect(noNoPonto(l, -50, -50, 4)).toBeNull();
    expect(trilhaDoNo(luz).map((q) => q.no.id)).toEqual(['_total', 'casa', 'contas-da-casa', 'luz']);
  });
});

describe('enquadrar e rótulos', () => {
  it('cabe na vista respeitando as margens, centralizado', () => {
    const e = enquadrar({ x0: 0, y0: 0, x1: 100, y1: 50 }, { largura: 300, altura: 300 }, { topo: 0, direita: 100, baixo: 0, esquerda: 0 });
    expect(e.k).toBe(2);
    expect([e.x, e.y]).toEqual([0, 100]);
  });
  it('rótulo: 2 linhas, 1 linha ou nenhum, conforme a altura na tela', () => {
    expect([linhasDeRotulo(40), linhasDeRotulo(20), linhasDeRotulo(10), linhasDeRotulo(10, true)]).toEqual([2, 1, 0, 1]);
  });
});
