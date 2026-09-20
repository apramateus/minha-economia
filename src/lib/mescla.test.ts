import { describe, expect, it } from 'vitest';
import { igual, mesclar3, resumoDaMudanca, reverter, tirarRepetidos } from './mescla';

const cat = (id: string, nome: string, valor: number) => ({ id, nome, valor });

describe('mescla de três vias (proposta do copiloto × o que o usuário mudou enquanto isso)', () => {
  const base = { orcamento: [cat('luz', 'Luz', 75), cat('agua', 'Água', 140)], saida: { runwayMeses: 6 } };

  it('só a proposta mudou: vale a proposta', () => {
    const proposta = { ...base, orcamento: [cat('luz', 'Luz', 90), cat('agua', 'Água', 140)] };
    expect(mesclar3(base, base, proposta)).toEqual({ valor: proposta, conflitos: [] });
  });

  it('cada um mudou uma coisa diferente: as duas entram', () => {
    const atual = { ...base, orcamento: [cat('luz', 'Luz', 75), cat('agua', 'Água', 150)] }; // o usuário, no app
    const proposta = { ...base, orcamento: [cat('luz', 'Luz', 90), cat('agua', 'Água', 140), cat('gas', 'Gás', 60)] };
    const m = mesclar3(base, atual, proposta);
    expect(m.conflitos).toEqual([]);
    expect(m.valor).toEqual({ ...base, orcamento: [cat('luz', 'Luz', 90), cat('agua', 'Água', 150), cat('gas', 'Gás', 60)] });
  });

  it('os dois mudaram o mesmo valor: conflito, fica o do usuário', () => {
    const atual = { ...base, orcamento: [cat('luz', 'Luz', 80), cat('agua', 'Água', 140)] };
    const proposta = { ...base, orcamento: [cat('luz', 'Luz', 90), cat('agua', 'Água', 140)] };
    const m = mesclar3(base, atual, proposta);
    expect(m.conflitos).toEqual(['orcamento › Luz › valor']);
    expect(m.valor).toEqual(atual);
  });

  it('o usuário apagou o que a proposta mudou: conflito; apagou o que ela não mexeu: some', () => {
    const atual = { ...base, orcamento: [cat('agua', 'Água', 140)] };
    expect(mesclar3(base, atual, { ...base, orcamento: [cat('luz', 'Luz', 90), cat('agua', 'Água', 140)] }).conflitos).toEqual([
      'orcamento › Luz',
    ]);
    expect(mesclar3(base, atual, { ...base, saida: { runwayMeses: 8 } })).toEqual({
      valor: { orcamento: [cat('agua', 'Água', 140)], saida: { runwayMeses: 8 } },
      conflitos: [],
    });
  });

  it('listas sem id (regras): a nova do topo continua no topo, junto com a do usuário', () => {
    const regras = [{ padrao: 'DROGARIA', linha: 'farmacia' }];
    const atual = [...regras, { padrao: 'UBER', linha: 'transporte' }];
    const proposta = [{ padrao: 'IFOOD', linha: 'restaurante' }, ...regras];
    expect(mesclar3(regras, atual, proposta).valor).toEqual([
      { padrao: 'IFOOD', linha: 'restaurante' },
      { padrao: 'DROGARIA', linha: 'farmacia' },
      { padrao: 'UBER', linha: 'transporte' },
    ]);
  });

  it('a proposta reordenou (ex.: prioridade das metas) e o usuário não: vale a ordem nova', () => {
    const metas = [cat('a', 'A', 1), cat('b', 'B', 2), cat('c', 'C', 3)];
    const proposta = [metas[2], metas[0], metas[1]];
    expect(mesclar3(metas, metas, proposta).valor).toEqual(proposta);
    const atual = [metas[0], metas[1], metas[2], cat('d', 'D', 4)];
    expect((mesclar3(metas, atual, proposta).valor as { id: string }[]).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('igual não liga para a ordem das chaves', () => {
    expect(igual({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(igual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
  });
});

describe('desfazer sem atropelar o que veio depois', () => {
  const t = (id: string, linha: string | null, hash?: string) => ({ id, linha, ...(hash ? { hash } : {}) });

  it('volta só o que a operação mudou; o que chegou depois fica', () => {
    const antes = [t('1', 'mercado'), t('2', 'luz')];
    const depois = [t('1', 'comida'), t('2', 'comida')]; // juntou mercado e luz em comida
    const agora = [...depois, t('3', 'gasolina')]; // a sincronização trouxe um lançamento novo
    expect(reverter(antes, depois)(agora)).toEqual([t('1', 'mercado'), t('2', 'luz'), t('3', 'gasolina')]);
  });

  it('o que você mudou depois no mesmo lançamento continua valendo', () => {
    const antes = [t('1', 'mercado')];
    const depois = [t('1', 'comida')];
    expect(reverter(antes, depois)([t('1', 'feira')])).toEqual([t('1', 'feira')]);
  });
});

describe('mesmo lançamento do banco por dois caminhos', () => {
  const t = (id: string, hash?: string) => ({ id, ...(hash ? { hash } : {}) });

  it('tira a cópia nova e fica com a que já estava gravada', () => {
    const gravados = [t('a', 'pluggy:1'), t('b', 'pluggy:2')];
    const lista = [...gravados, t('c', 'pluggy:2'), t('d', 'pluggy:3'), t('e')];
    expect(tirarRepetidos(lista, gravados)).toEqual([t('a', 'pluggy:1'), t('b', 'pluggy:2'), t('d', 'pluggy:3'), t('e')]);
  });
});

describe('resumo da proposta', () => {
  it('conta o que muda em cada lista', () => {
    const antes = [{ id: '1', linha: null }, { id: '2', linha: null }, { id: '3', linha: 'x' }];
    const depois = [{ id: '1', linha: 'mercado' }, { id: '2', linha: 'mercado' }, { id: '3', linha: 'x' }, { id: '4', linha: 'y' }];
    expect(resumoDaMudanca('transacoes', antes, depois)).toEqual(['Lançamentos: 2 alterados · 1 novo']);
  });
  it('categorias no plano, e o que não é lista vira "outros ajustes"', () => {
    const antes = { orcamento: [{ id: 'a', valor: 1 }], saida: { runwayMeses: 6 } };
    const depois = { orcamento: [{ id: 'a', valor: 2 }, { id: 'b', valor: 1 }], saida: { runwayMeses: 8 } };
    expect(resumoDaMudanca('config', antes, depois)).toEqual(['Categorias: 1 alterada · 1 nova', 'Plano: outros ajustes']);
    expect(resumoDaMudanca('config', antes, antes)).toEqual([]);
  });
});
