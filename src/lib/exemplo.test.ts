import { describe, expect, it } from 'vitest';
import configSeed from '../../seed/config.json';
import patrimonioSeed from '../../seed/patrimonio.json';
import { lancamentosDeExemplo, semExemplo, temExemplo } from './exemplo';
import type { Patrimonio, Transacao } from './tipos';

const hoje = new Date(2026, 8, 18); // 18/09/2026
const exemplo = lancamentosDeExemplo(hoje);
const patrimonio = patrimonioSeed as Patrimonio;

describe('números de exemplo de quem acabou de instalar', () => {
  it('3 meses até hoje, todos marcados como exemplo', () => {
    expect(exemplo.length).toBeGreaterThan(60);
    expect(exemplo.every((t) => t.origem === 'demo' && t.hash === `demo:${t.id}`)).toBe(true);
    expect(exemplo[0].data >= '2026-07-01').toBe(true);
    expect(exemplo.every((t) => t.data <= '2026-09-18')).toBe(true);
    expect(new Set(exemplo.map((t) => t.id)).size).toBe(exemplo.length);
  });

  it('as categorias existem no seed/ e o mês atual tem dois "a categorizar"', () => {
    const ids = new Set(configSeed.orcamento.map((l) => l.id));
    expect(exemplo.filter((t) => t.linha).every((t) => ids.has(t.linha!))).toBe(true);
    expect(exemplo.filter((t) => t.data >= '2026-09-01' && t.tipo === 'despesa' && !t.linha && !t.editado)).toHaveLength(2);
  });

  it('é repetível (o mesmo dia gera os mesmos valores)', () => {
    expect(lancamentosDeExemplo(hoje)).toEqual(exemplo);
  });

  it('limpar tira só o exemplo e deixa o que é real', () => {
    const real: Transacao = { id: 'r1', data: '2026-09-10', valor: 10, tipo: 'despesa', descricao: 'PADARIA', conta: 'conta', origem: 'import' };
    const comReal = { ...patrimonio, contas: [...patrimonio.contas, { id: 'nubank', nome: 'Conta', saldo: 100, reserva: false }] };
    expect(temExemplo([...exemplo, real], comReal)).toBe(true);
    const limpo = semExemplo([...exemplo, real], comReal);
    expect(limpo.transacoes).toEqual([real]);
    expect(limpo.patrimonio.contas.map((c) => c.id)).toEqual(['nubank']);
    expect(limpo.patrimonio.dividas).toEqual([]);
    expect(temExemplo(limpo.transacoes, limpo.patrimonio)).toBe(false);
  });
});
