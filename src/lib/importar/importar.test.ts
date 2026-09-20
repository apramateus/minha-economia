import { describe, expect, it } from 'vitest';
import configFixture from '../__fixtures__/config.json';
import regrasFixture from '../__fixtures__/regras.json';
import type { Config, Regra, Transacao } from '../tipos';
import { parseData, parseValor } from './formatos';
import { acharRegra, lerArquivo, montarPrevia, reclassificar, sugerirPadrao } from './index';

const config = configFixture as Config;
const regras = regrasFixture as Regra[];

const FATURA_C6 = [
  'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)',
  '14/09/2026;FULANO;1234;Restaurantes;IFD*IFOOD CLUB;Única;0;0;42,90',
  '14/09/2026;FULANO;1234;Restaurantes;IFD*IFOOD CLUB;Única;0;0;42,90',
  '15/09/2026;FULANO;1234;Educação;UDEMY ONLINE COURSES;Única;20,00;5,50;110,00',
  '16/09/2026;FULANO;1234;Vestuário;ZARA BRASIL;Única;0;0;1.299,90',
  '10/09/2026;FULANO;1234;-;Inclusao de Pagamento    ;Única;0;0;-1.800,00',
  '12/09/2026;FULANO;1234;-;ESTORNO ZARA;Única;0;0;-99,90',
].join('\n');

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905000000[-3:BRT]<TRNAMT>-1500.00<FITID>abc1<MEMO>PIX ENVIADO - IMOBILIARIA
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>6000.00<FITID>abc2<MEMO>TED RECEBIDA EMPRESA LTDA
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260911<TRNAMT>-1800.00<FITID>abc3<MEMO>PAGAMENTO DE FATURA
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('valores e datas', () => {
  it.each([
    ['1.299,90', 1299.9],
    ['-2.500,00', -2500],
    ['R$ 42,90', 42.9],
    ['1234.56', 1234.56],
    ['1.234', 1234],
    ['(10,00)', -10],
    ['', null],
  ])('parseValor(%s) = %s', (s, v) => expect(parseValor(s)).toBe(v));

  it('datas brasileiras, ISO e OFX', () => {
    expect(parseData('14/09/2026')).toBe('2026-09-14');
    expect(parseData('4/9/26')).toBe('2026-09-04');
    expect(parseData('2026-09-14T10:00')).toBe('2026-09-14');
    expect(parseData('20260905000000[-3:BRT]')).toBe('2026-09-05');
  });
});

describe('regras', () => {
  it('casam só no começo de palavra', () => {
    expect(acharRegra(regras, 'AUTO POSTO CENTRAL')?.linha).toBe('combustivel');
    expect(acharRegra(regras, 'DAS IMPOSTO SIMPLES')).toBeUndefined();
    expect(acharRegra(regras, 'DROGA RAIA 123')?.linha).toBe('farmacia');
    expect(acharRegra(regras, 'QUIOSQUE DA PRAIA')).toBeUndefined();
    expect(acharRegra(regras, 'Pão de Açúcar')?.linha).toBe('mercado');
  });

  it('regra com faixa de valor: LOJA CENTRAL a partir de R$ 150 é presente', () => {
    const rs = [{ padrao: 'LOJA CENTRAL', valorMin: 150, linha: 'presentes' }, { padrao: 'LOJA CENTRAL', linha: 'mercado' }];
    expect(acharRegra(rs, 'LOJA CENTRAL FILIAL 475', -230.98)?.linha).toBe('presentes');
    expect(acharRegra(rs, 'LOJA CENTRAL FILIAL 475', 25.98)?.linha).toBe('mercado');
    expect(acharRegra(rs, 'LOJA CENTRAL FILIAL 475')?.linha).toBe('mercado'); // sem valor, a de faixa não casa
    expect(acharRegra([{ padrao: 'POSTO BOM', valorMin: 15, linha: 'combustivel' }], 'POSTO BOM CIDADE FICTIC', 7.99)).toBeUndefined();
  });

  it('sugere padrão para regra nova: o nome, com até duas palavras', () => {
    const cartao = (nome: string) => `${nome.padEnd(22)} ${'CIDADE FICTIC'.padEnd(13)} BRA`;
    expect(sugerirPadrao('ZARA BRASIL')).toBe('ZARA BRASIL');
    expect(sugerirPadrao('PAG*JoseDaSilva')).toBe('JOSEDASILVA');
    expect(sugerirPadrao('UBER *TRIP 123')).toBe('UBER'); // "UBER TRIP" não aparece assim na descrição
    expect(sugerirPadrao('Pix enviado para MARIANA COSTA DOS SANTOS')).toBe('MARIANA COSTA');
    expect(sugerirPadrao('Pix enviado para VOLTARA DISTRIBUICAO S.A')).toBe('VOLTARA DISTRIBUICAO');
    expect(sugerirPadrao(cartao('IFD*SABOR CASEIRO LTDA'))).toBe('SABOR CASEIRO');
    expect(sugerirPadrao(cartao('IFD*11223344 BEATRIZ P'))).toBe('BEATRIZ');
    expect(sugerirPadrao('12.345.678 RAFAEL DE ALMEIDA')).toBe('RAFAEL');
    expect(sugerirPadrao(cartao('DM          *SPOTIFY'))).toBe('SPOTIFY');
    expect(sugerirPadrao(cartao('MERCADOLIVRE*MERCADOL'))).toBe('MERCADOLIVRE');
  });
});

describe('fatura CSV do C6', () => {
  const lido = lerArquivo(FATURA_C6);

  it('é reconhecida e vai para o cartão (o que já existe, se houver)', () => {
    expect(lido.formato).toBe('c6-fatura');
    expect(lido.contaSugerida).toBe('cartao');
    expect(lerArquivo(FATURA_C6, ['c6-conta', 'c6-cartao']).contaSugerida).toBe('c6-cartao'); // instalação antiga
    expect(lido.linhas).toHaveLength(6);
  });

  it('classifica: iFood, curso em dólar, não planejado, pagamento = transferência, estorno = despesa negativa', () => {
    const p = montarPrevia(lido.linhas!, 'cartao', regras, config, []).map((x) => x.transacao);
    expect(p[0]).toMatchObject({ tipo: 'despesa', linha: 'ifood', valor: 42.9, data: '2026-09-14' });
    expect(p[2]).toMatchObject({ tipo: 'despesa', linha: 'cursos', valor: 110 });
    expect(p[3]).toMatchObject({ tipo: 'despesa', linha: null, valor: 1299.9 });
    expect(p[4]).toMatchObject({ tipo: 'transferencia', valor: 1800 });
    expect(p[5]).toMatchObject({ tipo: 'despesa', valor: -99.9 });
  });

  it('dois pedidos iguais no mesmo dia não são duplicata; reimportar o arquivo é', () => {
    const primeira = montarPrevia(lido.linhas!, 'cartao', regras, config, []);
    expect(primeira.filter((x) => x.duplicada)).toHaveLength(0);
    expect(primeira[0].transacao.hash).not.toBe(primeira[1].transacao.hash);

    const segunda = montarPrevia(lido.linhas!, 'cartao', regras, config, primeira.map((x) => x.transacao));
    expect(segunda.every((x) => x.duplicada)).toBe(true);
  });
});

describe('OFX (extrato da conta)', () => {
  it('lê entradas, saídas e pagamento de fatura', () => {
    const lido = lerArquivo(OFX);
    expect(lido.formato).toBe('ofx');
    expect(lido.contaSugerida).toBe('conta');
    expect(lerArquivo(OFX, ['c6-cartao', 'c6-conta']).contaSugerida).toBe('c6-conta');
    const p = montarPrevia(lido.linhas!, 'conta', regras, config, []).map((x) => x.transacao);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ tipo: 'despesa', valor: 1500, linha: null, data: '2026-09-05' });
    expect(p[1]).toMatchObject({ tipo: 'receita', valor: 6000, fonte: 'outros' });
    expect(p[2]).toMatchObject({ tipo: 'transferencia', valor: 1800 });
    expect(p[0].hash).toBe('ofx:conta:abc1');
  });
});

describe('CSV genérico', () => {
  it('adivinha as colunas pelo cabeçalho', () => {
    const lido = lerArquivo('Data,Histórico,Valor\n01/09/2026,"Uber *trip, SP",-23.50\n02/09/2026,Salário,5400.00');
    expect(lido.formato).toBe('csv');
    expect(lido.linhas).toEqual([
      { data: '2026-09-01', valor: -23.5, descricao: 'Uber *trip, SP' },
      { data: '2026-09-02', valor: 5400, descricao: 'Salário' },
    ]);
  });

  it('sem colunas reconhecidas, pede mapeamento', () => {
    expect(lerArquivo('a;b;c\n1;2;3').linhas).toBeNull();
  });
});

describe('lançamentos feitos à mão', () => {
  it('a fatura reconhece o iFood que você já lançou (valor igual, até 7 dias)', () => {
    const lido = lerArquivo(FATURA_C6);
    const manual = {
      id: 'm1',
      data: '2026-09-13',
      valor: 42.9,
      tipo: 'despesa' as const,
      linha: 'ifood',
      descricao: 'iFood',
      conta: 'cartao',
      origem: 'manual' as const,
    };
    const p = montarPrevia(lido.linhas!, 'cartao', regras, config, [manual]);
    expect(p[0].jaLancada?.id).toBe('m1');
    expect(p[1].jaLancada).toBeUndefined(); // o segundo pedido igual é outro pedido
    expect(p[3].jaLancada).toBeUndefined();

    // o mesmo valor lançado à mão noutra conta (dinheiro) é outra compra: a do cartão entra normalmente
    const p2 = montarPrevia(lido.linhas!, 'cartao', regras, config, [{ ...manual, conta: 'dinheiro' }]);
    expect(p2.every((x) => !x.jaLancada)).toBe(true);
  });
});

describe('entrou dinheiro num lugar que tem regra de gasto', () => {
  const regra: Regra[] = [{ padrao: 'LOJA CENTRAL', tipo: 'despesa' }];
  const entrou = { data: '2026-09-10', valor: 80, descricao: 'LOJA CENTRAL FILIAL 475' };
  const uma = (conta: string, l = entrou) => montarPrevia([l], conta, regra, config, [])[0].transacao;

  it('no cartão é estorno (desconta do gasto) e na conta é entrada', () => {
    expect(uma('cartao')).toMatchObject({ tipo: 'despesa', valor: -80 });
    expect(uma('conta')).toMatchObject({ tipo: 'receita', valor: 80 });
  });

  it('o que sai continua gasto', () => {
    expect(uma('conta', { ...entrou, valor: -80 })).toMatchObject({ tipo: 'despesa', valor: 80 });
  });
});

describe('reaplicar as regras (npm run recategorizar)', () => {
  const t: Transacao = {
    id: '1',
    data: '2026-09-10',
    valor: 320,
    tipo: 'transferencia',
    linha: null,
    descricao: 'MENSALIDADE ESCOLA DE IDIOMAS',
    conta: 'conta',
    origem: 'import',
    hash: 'ofx:conta:z1',
  };
  const agoraECurso: Regra[] = [{ padrao: 'ESCOLA DE IDIOMAS', linha: 'cursos' }];

  it('o que estava como transferência volta a ser gasto quando a regra passa a dar uma categoria', () => {
    expect(reclassificar(t, agoraECurso, config)).toMatchObject({ tipo: 'despesa', linha: 'cursos' });
  });

  it('sem regra que diga outra coisa continua transferência, e o que você editou nunca muda', () => {
    expect(reclassificar(t, [{ padrao: 'MENSALIDADE', tipo: 'transferencia' }], config)).toBe(t);
    expect(reclassificar({ ...t, editado: true }, agoraECurso, config)).toMatchObject({ tipo: 'transferencia' });
  });
});
