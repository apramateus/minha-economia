import { describe, expect, it } from 'vitest';
import configFixture from '../__fixtures__/config.json';
import regrasFixture from '../__fixtures__/regras.json';
import type { Config, Regra, Transacao } from '../tipos';
import { lerArquivo, montarPrevia } from './index';
import { atualizacaoDoBanco, contaDoApp, linhaDaPluggy, type TransacaoPluggy } from './pluggy';

const config = configFixture as Config;
const regras = regrasFixture as Regra[];

const t = (x: Partial<TransacaoPluggy>): TransacaoPluggy => ({
  id: 'abc',
  date: '2026-09-17T03:00:00.000Z', // meia-noite em Brasília
  description: 'Teste',
  amount: 10,
  type: 'DEBIT',
  ...x,
});

describe('conversão da Pluggy', () => {
  it('conta corrente: DEBIT sai, CREDIT entra', () => {
    expect(linhaDaPluggy(t({ amount: -1500, type: 'DEBIT' }), 'BANK').valor).toBe(-1500);
    expect(linhaDaPluggy(t({ amount: 6000, type: 'CREDIT' }), 'BANK').valor).toBe(6000);
  });

  it('cartão: compra positiva vira saída; pagamento negativo vira entrada', () => {
    expect(linhaDaPluggy(t({ amount: 42.9 }), 'CREDIT').valor).toBe(-42.9);
    expect(linhaDaPluggy(t({ amount: -1800, type: 'CREDIT' }), 'CREDIT').valor).toBe(1800);
  });

  it('data no fuso local, hash estável e parcela na descrição', () => {
    const l = linhaDaPluggy(t({ id: 'x1', creditCardMetadata: { installmentNumber: 2, totalInstallments: 10 } }), 'CREDIT');
    expect(l.data).toBe('2026-09-17');
    expect(l.hash).toBe('pluggy:x1');
    expect(l.descricao).toBe('Teste (2/10)');
  });

  it('descrição bruta e estabelecimento ajudam as regras', () => {
    const l = linhaDaPluggy(t({ description: 'Pedido online', descriptionRaw: 'IFD*IFOOD CLUB', amount: 45 }), 'CREDIT');
    const [p] = montarPrevia([l], 'cartao', regras, config, []);
    expect(p.transacao).toMatchObject({ linha: 'ifood', descricao: 'Pedido online', valor: 45, tipo: 'despesa' });
  });

  it('guarda a categoria do banco', () => {
    const [p] = montarPrevia([linhaDaPluggy(t({ category: 'Food delivery' }), 'CREDIT')], 'cartao', regras, config, []);
    expect(p.transacao.categoriaBanco).toBe('Food delivery');
  });
});

describe('sincronizar de novo', () => {
  it('a mesma transação da Pluggy é reconhecida pelo id', () => {
    const l = linhaDaPluggy(t({ id: 'p1', amount: 30 }), 'CREDIT');
    const [primeira] = montarPrevia([l], 'cartao', regras, config, []);
    const [segunda] = montarPrevia([{ ...l, valor: -31 }], 'cartao', regras, config, [primeira.transacao]);
    expect(segunda.duplicada).toBe(true);
    expect(segunda.existente?.id).toBe(primeira.transacao.id);
  });

  it('não duplica o que já veio pela fatura CSV (mesma conta, mesmo valor, até 3 dias)', () => {
    const csv = lerArquivo(
      'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n16/09/2026;X;1;-;ZARA BRASIL;Única;0;0;349,90',
    );
    const importadas = montarPrevia(csv.linhas!, 'cartao', regras, config, []).map((p) => p.transacao);
    const [p] = montarPrevia(
      [linhaDaPluggy(t({ id: 'z', description: 'Zara', amount: 349.9, date: '2026-09-17T15:00:00.000Z' }), 'CREDIT')],
      'cartao',
      regras,
      config,
      importadas,
    );
    expect(p.jaLancada?.descricao).toBe('ZARA BRASIL');
  });

  it('mas não confunde com outra conta', () => {
    const naConta: Transacao = {
      id: 'o',
      data: '2026-09-17',
      valor: 349.9,
      tipo: 'despesa',
      linha: null,
      descricao: 'X',
      conta: 'conta',
      origem: 'import',
      hash: 'conta|2026-09-17|-349.90|X#0',
    };
    const [p] = montarPrevia([linhaDaPluggy(t({ id: 'z', amount: 349.9 }), 'CREDIT')], 'cartao', regras, config, [naConta]);
    expect(p.jaLancada).toBeUndefined();
  });
});

describe('banco manda de novo uma transação que já existe', () => {
  const e: Transacao = { id: '1', data: '2026-08-28', valor: 1500, tipo: 'despesa', linha: 'aluguel', descricao: 'IMOBILIARIA EXEMPLO', conta: 'conta', origem: 'import' };
  it('pendente → lançada: atualiza valor e data', () => {
    expect(atualizacaoDoBanco(e, { valor: 1500, data: '2026-08-28' })).toBeNull();
    expect(atualizacaoDoBanco(e, { valor: 1499.5, data: '2026-08-29' })).toEqual({ valor: 1499.5, data: '2026-08-29' });
  });
  it('se você moveu a data (aluguel pago adiantado), a sua fica; o banco atualiza só dataBanco', () => {
    const movida = { ...e, data: '2026-09-01', dataBanco: '2026-08-28' };
    expect(atualizacaoDoBanco(movida, { valor: 1500, data: '2026-08-28' })).toBeNull();
    expect(atualizacaoDoBanco(movida, { valor: 1500, data: '2026-08-29' })).toEqual({ dataBanco: '2026-08-29' });
  });
  it('se você mudou o valor (caução separado), o seu fica; o banco atualiza só valorBanco', () => {
    const separado = { ...e, valor: 1500, valorBanco: 2000 };
    expect(atualizacaoDoBanco(separado, { valor: 2000, data: '2026-08-28' })).toBeNull();
    expect(atualizacaoDoBanco(separado, { valor: 2010, data: '2026-08-28' })).toEqual({ valorBanco: 2010 });
  });
  it('não mexe no que foi lançado à mão', () => {
    expect(atualizacaoDoBanco({ ...e, origem: 'manual' }, { valor: 1, data: '2026-01-01' })).toBeNull();
  });
});

describe('contas', () => {
  it('primeira conta corrente e primeiro cartão viram conta e cartao; as seguintes, pelo final do número; o mapeamento salvo manda', () => {
    expect(contaDoApp({ id: 'a', type: 'BANK', name: 'Conta', balance: 0 }, {})).toBe('conta');
    expect(contaDoApp({ id: 'b', type: 'CREDIT', name: 'Cartão', balance: 0 }, {})).toBe('cartao');
    expect(contaDoApp({ id: 'c', type: 'BANK', name: 'Outra', number: '0001-99887', balance: 0 }, { a: 'conta' })).toBe('conta-9887');
    expect(contaDoApp({ id: 'd', type: 'CREDIT', name: 'Outro', number: '5555', balance: 0 }, { b: 'cartao' })).toBe('cartao-5555');
    expect(contaDoApp({ id: 'a', type: 'BANK', name: 'Conta', balance: 0 }, { a: 'minha-conta' })).toBe('minha-conta');
  });

  it('instalação antiga: as contas já mapeadas com os ids de antes (c6-conta, c6-cartao) continuam', () => {
    const mapa = { a: 'c6-conta', b: 'c6-cartao' };
    expect(contaDoApp({ id: 'a', type: 'BANK', name: 'Conta', balance: 0 }, mapa)).toBe('c6-conta');
    expect(contaDoApp({ id: 'b', type: 'CREDIT', name: 'Cartão', balance: 0 }, mapa)).toBe('c6-cartao');
  });
});
