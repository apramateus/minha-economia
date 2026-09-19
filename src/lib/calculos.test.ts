import { describe, expect, it } from 'vitest';
import configFixture from './__fixtures__/config.json';
import patrimonioFixture from './__fixtures__/patrimonio.json';
import metasFixture from './__fixtures__/metas.json';
import {
  aportePlanejado,
  cascataMetas,
  custoEssencial,
  custoEssencialReal,
  custoReal,
  mediaMensal,
  mediaRealPorLinha,
  moverNaCascata,
  rendaFixaMensal,
  rendaMedia,
  resumoPatrimonio,
  ritmoAporte,
  runway,
  sobraPlanejada,
  totalNatureza,
} from './calculos';
import type { Config, Metas, Patrimonio, Transacao } from './tipos';
import { planoTotal } from './categorias';

const config = configFixture as Config;
const patrimonio = patrimonioFixture as Patrimonio;
const metas = metasFixture as Metas;

let n = 0;
const t = (data: string, valor: number, linha: string | null, extra: Partial<Transacao> = {}): Transacao => ({
  id: String(n++),
  data,
  valor,
  tipo: 'despesa',
  linha,
  descricao: 'teste',
  conta: 'cartao',
  origem: 'manual',
  ...extra,
});

describe('números do plano', () => {
  it('fixos = 3.110', () => expect(totalNatureza(config, 'fixo')).toBe(3110));
  it('água: R$ 180 em 3 meses = 60/mês', () => expect(mediaMensal(180, 3)).toBe(60));
  it('comida = restaurante 400 + almoço fora 300 + iFood 200', () => expect(planoTotal(config, 'comida')).toBe(900));
  it('flexíveis = 1.560 e pontuais (média por mês) = 220', () => {
    expect(totalNatureza(config, 'flexivel')).toBe(1560);
    expect(totalNatureza(config, 'pontual')).toBe(220);
  });
  it('renda fixa = 7.000', () => expect(rendaFixaMensal(config)).toBe(7000));
  it('custo para viver (plano) = todas as categorias', () => expect(custoEssencial(config)).toBe(3110 + 1560 + 220));
  it('sobra = renda fixa − plano, e é o que vai para as metas', () => {
    expect(sobraPlanejada(config)).toBe(7000 - 4890);
    expect(aportePlanejado(config)).toBe(7000 - 4890);
  });

  it('patrimônio líquido = banco e investimentos − dívidas (a receber não entra; pode ficar negativo)', () => {
    const p = resumoPatrimonio(patrimonio);
    expect(p.liquido).toBe(2500 - 3300);
    expect(p.bens).toBe(10000);
    expect(p.total).toBe(-800 + 10000);
    expect(p.reserva).toBe(600); // só a conta marcada como reserva
    expect(runway(p.liquido, custoEssencial(config))).toBe(0);
    expect(runway(12000, custoEssencial(config))).toBe(2.5); // 12000 ÷ 4890 = 2,45
  });
});

describe('custo para viver real', () => {
  const ts = [
    t('2026-07-05', 1500, 'aluguel'),
    t('2026-08-05', 1500, 'aluguel'),
    t('2026-08-10', 300, null), // não planejado
    t('2026-08-11', 100, 'lazer'), // flexível: entra
    t('2026-08-13', 800, 'dentista'), // pontual: entra pela média do plano, não pelo que caiu no mês
    t('2026-08-12', 50, 'mercado', { tipo: 'transferencia' }), // não é gasto
    t('2026-09-01', 999, 'aluguel'), // mês atual não entra
  ];
  it('média por categoria nos meses pedidos', () => {
    expect(mediaRealPorLinha(config, ts, ['2026-07', '2026-08'])).toEqual({ aluguel: 1500, _nao_planejado: 150, lazer: 50, dentista: 400 });
  });
  it('fixos + flexíveis + não planejado reais; pontuais pela média do plano (220)', () => {
    expect(custoEssencialReal(config, ts, ['2026-07', '2026-08'])).toBe(1500 + 150 + 50 + 220);
    expect(custoEssencialReal(config, ts, ['2026-08'])).toBe(1500 + 300 + 100 + 220);
  });
});

describe('custo de verdade (base dos meses de liberdade)', () => {
  it('sem mês completo com dados, usa o plano', () => {
    expect(custoReal(config, [t('2026-09-03', 50, 'mercado')], '2026-09')).toEqual({ valor: custoEssencial(config), meses: [], fonte: 'plano' });
  });
  it('é o mês passado, não a média (o mês atual ainda não fechou)', () => {
    const ts = [t('2026-07-05', 1800, 'aluguel'), t('2026-08-05', 1500, 'aluguel'), t('2026-08-09', 150, null), t('2026-09-01', 9999, 'aluguel')];
    expect(custoReal(config, ts, '2026-09')).toEqual({ valor: 1500 + 150 + 220, meses: ['2026-08'], fonte: 'real' });
  });
  it('mês passado sem nada lançado: usa o plano', () => {
    expect(custoReal(config, [t('2026-07-05', 1800, 'aluguel')], '2026-09').fonte).toBe('plano');
  });
});

describe('renda média', () => {
  const ts = [
    t('2026-06-05', 6000, null, { tipo: 'receita', fonte: 'salario' }),
    t('2026-07-05', 6000, null, { tipo: 'receita', fonte: 'salario' }),
    t('2026-07-20', 1500, null, { tipo: 'receita', fonte: 'bonus' }),
    t('2026-08-05', 6000, null, { tipo: 'receita', fonte: 'salario' }),
    t('2026-08-06', 500, null, { tipo: 'transferencia' }), // não é renda
    t('2026-09-05', 6000, null, { tipo: 'receita', fonte: 'salario' }), // mês atual ainda não fechou
  ];
  it('últimos 3 meses completos', () => {
    expect(rendaMedia(ts, 3, '2026-09')).toEqual({ valor: 6500, meses: ['2026-06', '2026-07', '2026-08'] });
  });
  it('último ano: só os meses desde o primeiro lançamento', () => {
    expect(rendaMedia(ts, 12, '2026-09').meses).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(rendaMedia([], 12, '2026-09')).toEqual({ valor: 0, meses: [] });
  });
});

describe('metas em cascata', () => {
  const custo = 4890;
  const aporte = 2110;

  it('empréstimo primeiro, depois reserva, computador e seis meses', () => {
    const etapas = cascataMetas(metas, 2000, 1500, custo, aporte, '2026-09');
    expect(etapas.map((e) => e.id)).toEqual(['_emprestimo', 'reserva', 'computador', 'seis-meses']);
    expect(etapas[0].atual).toBe(true);
    expect(etapas[1].saldo).toBe(2000);
    expect(etapas[3].alvo).toBe(6 * 4890);
    // empréstimo (1500) + reserva (3000) + computador (8000) = 12500 ÷ 2110 ≈ 5,9 meses
    expect(etapas[2].previsao).toBe('2027-03');
  });

  it('a reserva enche as metas em ordem', () => {
    const etapas = cascataMetas(metas, 7000, 0, custo, aporte, '2026-09');
    expect(etapas[0]).toMatchObject({ id: 'reserva', completa: true, saldo: 5000 });
    expect(etapas[1]).toMatchObject({ id: 'computador', atual: true, saldo: 2000 });
  });

  it('o empréstimo muda de lugar arrastando e fica lá', () => {
    const ids = (m: Metas, emprestimo = 1500) => cascataMetas(m, 0, emprestimo, custo, aporte, '2026-09').map((e) => e.id);
    const depois = moverNaCascata(metas, '_emprestimo', 'computador', false, true);
    expect(depois.emprestimoDepois).toBe('computador');
    expect(ids(depois)).toEqual(['reserva', 'computador', '_emprestimo', 'seis-meses']);
    // uma meta nova entra no fim, depois do empréstimo
    const nova: Metas = { ...depois, metas: [...depois.metas, { id: 'viagem', nome: 'Viagem', alvo: 3000 }] };
    expect(ids(nova)).toEqual(['reserva', 'computador', '_emprestimo', 'seis-meses', 'viagem']);
    // a meta de antes dele cumprida: ele não sai do lugar
    const cumprida: Metas = { ...depois, metas: depois.metas.map((x) => (x.id === 'computador' ? { ...x, concluida: true } : x)) };
    expect(ids(cumprida)).toEqual(['reserva', '_emprestimo', 'seis-meses']);
    // mover uma meta para antes dele; e ele de volta para o topo
    expect(ids(moverNaCascata(depois, 'seis-meses', '_emprestimo', true, true))).toEqual(['reserva', 'computador', 'seis-meses', '_emprestimo']);
    const topo = moverNaCascata(depois, '_emprestimo', 'reserva', true, true);
    expect(topo.emprestimoDepois).toBeUndefined();
    expect(ids(topo)).toEqual(['_emprestimo', 'reserva', 'computador', 'seis-meses']);
    // excluída das metas, a etapa some (a dívida continua)
    expect(ids({ ...depois, semEmprestimo: true })).toEqual(['reserva', 'computador', 'seis-meses']);
    // sem empréstimo, as metas mudam de ordem como antes
    expect(ids(moverNaCascata(metas, 'seis-meses', 'reserva', true, false), 0)).toEqual(['seis-meses', 'reserva', 'computador']);
  });

  it('meta cumprida (computador comprado) sai da cascata', () => {
    const m: Metas = { ...metas, metas: metas.metas.map((x) => (x.id === 'computador' ? { ...x, concluida: true } : x)) };
    expect(cascataMetas(m, 0, 0, custo, aporte, '2026-09').map((e) => e.id)).toEqual(['reserva', 'seis-meses']);
  });

  it('ritmo usa os aportes reais quando existem', () => {
    const m: Metas = { ...metas, aportes: [{ id: 'a', data: '2026-08-10', valor: 3000 }] };
    expect(ritmoAporte(m, '2026-09', aporte)).toEqual({ valor: 3000, fonte: 'real' });
    expect(ritmoAporte(metas, '2026-09', aporte)).toEqual({ valor: aporte, fonte: 'plano' });
  });
});
