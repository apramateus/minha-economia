import { describe, expect, it } from 'vitest';
import configFixture from './__fixtures__/config.json';
import type { Config, Transacao } from './tipos';
import { aCategorizar, gastosPorCategoria, mesesNoPeriodo, NAO_PLANEJADO, nomeEstabelecimento, periodoDoPreset, porEstabelecimento } from './analise';
import { reclassificar } from './importar/index';

const config = configFixture as Config;
let n = 0;
const t = (data: string, valor: number, linha: string | null, descricao = 'X', extra: Partial<Transacao> = {}): Transacao => ({
  id: String(n++),
  data,
  valor,
  tipo: 'despesa',
  linha,
  descricao,
  conta: 'cartao',
  origem: 'import',
  ...extra,
});

describe('períodos', () => {
  it('presets', () => {
    expect(periodoDoPreset('mes', '2026-09-17')).toEqual({ de: '2026-09-01', ate: '2026-09-17' });
    expect(periodoDoPreset('mes-passado', '2026-09-17')).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
    expect(periodoDoPreset('3m', '2026-09-17')).toEqual({ de: '2026-07-01', ate: '2026-09-17' });
    expect(periodoDoPreset('tudo', '2026-09-17', [t('2026-06-01', 1, null)])).toEqual({ de: '2026-06-01', ate: '2026-09-17' });
  });
  it('um mês cheio ≈ 1 mês de orçamento', () => {
    expect(mesesNoPeriodo({ de: '2026-08-01', ate: '2026-08-31' })).toBeCloseTo(1.02, 2);
  });
});

describe('gastos por categoria', () => {
  const ts = [
    t('2026-08-02', 45, 'ifood'),
    t('2026-08-03', 40, 'ifood'),
    t('2026-08-05', 1250, null, 'LOJA DE MOVEIS'),
    t('2026-08-06', -10, 'ifood'), // estorno
    t('2026-07-30', 999, 'ifood'), // fora do período
    t('2026-08-07', 800, null, 'x', { tipo: 'transferencia' }),
  ];
  const r = gastosPorCategoria(config, ts, { de: '2026-08-01', ate: '2026-08-31' });

  it('soma por categoria, desconta estorno, ignora transferência e o que está fora do período', () => {
    expect(r.map((g) => [g.id, g.total, g.n])).toEqual([
      [NAO_PLANEJADO, 1250, 1],
      ['ifood', 75, 3],
    ]);
  });
  it('orçamento = meses do calendário no período', () => {
    expect(r[1].orcamento).toBe(200);
    expect(gastosPorCategoria(config, [t('2026-09-02', 1, 'ifood')], { de: '2026-07-01', ate: '2026-09-18' })[0].orcamento).toBe(600);
    expect(r[0].orcamento).toBeNull();
  });
});

describe('estabelecimentos', () => {
  const cartao = (nome: string, cidade: string, pais = 'BRA') => `${nome.padEnd(22)} ${cidade.padEnd(13)} ${pais}`;
  it.each([
    [cartao('IFD*SABOR CASEIRO LTDA', 'CIDADE FICTIC'), 'Sabor Caseiro Ltda'],
    [cartao('IFD*12345678 FULANO DE', 'CIDADE FICTIC'), 'Fulano De'],
    [cartao('FIGMA', 'SAN FRANCISCO', 'USA'), 'Figma'],
    [cartao('DL *GOOGLE WORKSPACEMA', 'SAO PABLO'), 'Google Workspacema'],
    [cartao('MERCADOLIVRE*BOAVENDA', 'SAO PAULO'), 'Mercado Livre Boavenda'],
    [cartao('MERCADO*CASAEBANHO', 'SAO PAULO') + ' (2/3)', 'Casaebanho'],
    [cartao('DM          *SPOTIFY', 'STOCKHOLM'), 'Spotify'],
    [cartao('SUPERMAIS 410', 'CIDADE FICTIC'), 'Supermais'],
    ['Pix enviado para MARIANA COSTA DOS SANTOS', 'Mariana Costa Dos Santos'],
    ['ALFA TELECOM', 'Alfa Telecom'],
  ])('%s → %s', (d, esperado) => expect(nomeEstabelecimento(d)).toBe(esperado));

  it('agrupa e ordena', () => {
    const r = porEstabelecimento([
      t('2026-08-01', 30, 'ifood', cartao('IFD*12345678 FULANO DE', 'CIDADE FICTIC')),
      t('2026-08-02', 20, 'ifood', cartao('IFD*87654321 FULANO DE', 'CIDADE FICTIC')),
      t('2026-08-03', 40, 'ifood', cartao('IFD*SABOR CASEIRO LTDA', 'CIDADE FICTIC')),
    ]);
    expect(r).toEqual([
      { nome: 'Fulano De', total: 50, n: 2 },
      { nome: 'Sabor Caseiro Ltda', total: 40, n: 1 },
    ]);
  });
});

describe('reclassificar com regras novas', () => {
  const regras = [
    { padrao: 'BANCO EXEMPLO', tipo: 'transferencia' as const },
    { padrao: 'EMPRESA EXEMPLO', fonte: 'salario' as const },
    { padrao: 'FIGMA', linha: 'aluguel' },
  ];
  it('não planejado vira categoria; pagamento vira transferência; Pix da empresa vira salário', () => {
    expect(reclassificar(t('2026-08-01', 10, null, 'FIGMA SF'), regras, config).linha).toBe('aluguel');
    expect(reclassificar(t('2026-08-01', 1800, null, 'BANCO EXEMPLO'), regras, config).tipo).toBe('transferencia');
    expect(reclassificar(t('2026-08-01', 5000, null, 'EMPRESA EXEMPLO', { tipo: 'receita', fonte: 'outros' }), regras, config).fonte).toBe('salario');
  });
  it('categoria do banco "Credit card payment" vira transferência quando nenhuma regra casa', () => {
    expect(reclassificar(t('2026-08-01', 450, null, 'QUALQUER', { categoriaBanco: 'Credit card payment' }), [], config).tipo).toBe('transferencia');
  });
  it('não mexe em lançamento manual nem editado', () => {
    const manual = t('2026-08-01', 10, null, 'FIGMA', { origem: 'manual' });
    const editado = t('2026-08-01', 10, 'lazer', 'FIGMA', { editado: true });
    expect(reclassificar(manual, regras, config)).toBe(manual);
    expect(reclassificar(editado, regras, config)).toBe(editado);
  });
});

describe('a categorizar', () => {
  it('só o que veio do banco sem categoria e ninguém olhou, por estabelecimento', () => {
    const ts = [
      t('2026-08-01', 30, null, 'PIX MARKETPLACE'),
      t('2026-08-03', 20, null, 'PIX MARKETPLACE'),
      t('2026-08-02', 1250, null, 'LOJA DE MOVEIS', { editado: true }), // você já confirmou: não planejado
      t('2026-08-02', 15, null, 'PAO', { origem: 'manual' }), // lançado à mão como não planejado
      t('2026-08-02', 50, 'mercado', 'MERCADO X'),
    ];
    const r = aCategorizar(config, ts);
    expect(r.map((g) => [g.nome, g.itens.length, g.total])).toEqual([['Pix Marketplace', 2, 50]]);
    expect(r[0].itens[0].data).toBe('2026-08-03'); // mais recente primeiro
  });
});
