import { describe, expect, it } from 'vitest';
import configFixture from './__fixtures__/config.json';
import type { Config, Transacao } from './tipos';
import {
  caminho,
  criar,
  descendentes,
  editar,
  excluir,
  filhas,
  idDeCategoria,
  incluirRegra,
  juntar,
  linhasVisiveis,
  listaEmArvore,
  mesclar,
  migrarConfig,
  mover,
  nomeLivre,
  parecidas,
  planoTotal,
  regraDoLancamento,
  temFilhas,
} from './categorias';

const config = configFixture as Config;
let n = 0;
const t = (descricao: string, extra: Partial<Transacao> = {}): Transacao => ({
  id: String(n++),
  data: '2026-09-01',
  valor: 50,
  tipo: 'despesa',
  linha: null,
  descricao,
  conta: 'conta',
  origem: 'import',
  ...extra,
});

describe('categorias', () => {
  it('id legível e sem repetir', () => {
    expect(idDeCategoria('Pet shop', config.orcamento)).toBe('pet-shop');
    expect(idDeCategoria('Ração / Veterinário', config.orcamento)).toBe('racao-veterinario');
    expect(idDeCategoria('Luz', [...config.orcamento, { id: 'luz', nome: 'Luz', valor: 0, natureza: 'fixo', pai: null }])).toBe('luz-2');
  });

  it('regra do lançamento conforme o tipo', () => {
    expect(regraDoLancamento(' voltara ', { tipo: 'despesa', linha: 'luz' })).toEqual({ padrao: 'VOLTARA', linha: 'luz' });
    expect(regraDoLancamento('BANCO EXEMPLO', { tipo: 'transferencia', linha: null })).toEqual({ padrao: 'BANCO EXEMPLO', tipo: 'transferencia' });
    expect(regraDoLancamento('ACME', { tipo: 'receita', linha: null, fonte: 'freela' })).toEqual({ padrao: 'ACME', fonte: 'freela' });
    expect(regraDoLancamento('X', { tipo: 'despesa', linha: null })).toBeNull(); // não planejado não vira regra
    expect(regraDoLancamento('  ', { tipo: 'despesa', linha: 'luz' })).toBeNull();
  });

  it('regra nova vai para o topo e substitui a do mesmo padrão', () => {
    const r = incluirRegra([{ padrao: 'IFD*', linha: 'ifood' }, { padrao: 'Voltara', linha: 'mercado' }], { padrao: 'VOLTARA', linha: 'luz' });
    expect(r).toEqual([{ padrao: 'VOLTARA', linha: 'luz' }, { padrao: 'IFD*', linha: 'ifood' }]);
  });

  it('parecidas: muda importadas, respeita manual, editadas e a própria', () => {
    const propria = t('Pix enviado para VOLTARA DISTRIBUICAO S.A');
    const outra = t('Pix enviado para VOLTARA DISTRIBUICAO S.A');
    const manual = t('VOLTARA', { origem: 'manual' });
    const editada = t('Pix enviado para VOLTARA DISTRIBUICAO S.A', { editado: true, linha: 'mercado' });
    const jaCerta = t('Pix enviado para VOLTARA DISTRIBUICAO S.A', { linha: 'luz' });
    const nada = t('Pix enviado para OUTRA PESSOA');
    const r = parecidas([propria, outra, manual, editada, jaCerta, nada], { padrao: 'VOLTARA', linha: 'luz' }, config, propria.id);
    expect(r).toEqual([{ ...outra, linha: 'luz' }]);
  });

  it('parecidas com categoria recém-criada', () => {
    const cfg = { ...config, orcamento: [...config.orcamento, { id: 'pet', nome: 'Pet', valor: 100, natureza: 'flexivel' as const, pai: null }] };
    const x = t('PETZ LOJA 12');
    expect(parecidas([x], { padrao: 'PETZ', linha: 'pet' }, config)).toEqual([]); // categoria ainda não existe
    expect(parecidas([x], { padrao: 'PETZ', linha: 'pet' }, cfg)[0].linha).toBe('pet');
  });
});

describe('migração dos formatos antigos', () => {
  const primeiro = {
    ...config,
    orcamento: [
      { id: 'aluguel', nome: 'Aluguel', valor: 1500, grupo: 'fixo', tipo: 'conta' },
      { id: 'ifood', nome: 'iFood', valor: 200, grupo: 'alimentacao', tipo: 'envelope' },
      { id: 'gasolina', nome: 'Gasolina', valor: 50, grupo: 'estimado', tipo: 'envelope' },
      { id: 'lazer', nome: 'Lazer', valor: 400, grupo: 'diversao', tipo: 'envelope' },
      { id: 'pet', nome: 'Pet', valor: 90, grupo: 'estimado', tipo: 'envelope' },
    ],
  } as unknown as Config;
  const m = migrarConfig(primeiro);
  it('1º formato: grupo vira natureza e a categoria vai para dentro da sugerida', () => {
    const naArvore = (id: string) => m.orcamento.find((l) => l.id === id);
    expect(['aluguel', 'ifood', 'gasolina', 'lazer', 'pet'].map((id) => [id, naArvore(id)?.natureza, naArvore(id)?.pai])).toEqual([
      ['aluguel', 'fixo', 'casa'],
      ['ifood', 'flexivel', 'comida'],
      ['gasolina', 'flexivel', 'transporte'],
      ['lazer', 'flexivel', null], // diversão virou flexível
      ['pet', 'flexivel', null], // desconhecida fica no nível principal
    ]);
    expect(naArvore('casa')).toMatchObject({ nome: 'Casa', valor: 0, pai: null });
    expect(naArvore('contas-da-casa')?.pai).toBe('casa');
    expect(m.orcamento.some((l) => 'grupo' in l)).toBe(false);
    expect('grupos' in m).toBe(false);
  });
  it('renda antiga (salário + bônus − imposto) vira a renda fixa; meta do iFood, freela e "dia a dia" saem', () => {
    const velho = {
      ...config,
      renda: { salario: 6000, bonusTrimestral: 1500, mesesBonus: [3, 6, 9, 12], impostoPct: 6 },
      ifood: { linha: 'ifood', maxPedidos: 10 },
      freela: { impostoExteriorPct: 5, impostoBrasilPct: 8, metaPct: 50 },
      rendaFixa: undefined,
      orcamento: config.orcamento.map((l) => (l.id === 'ifood' ? { ...l, diario: true } : l)),
    } as unknown as Config;
    const n = migrarConfig(velho);
    expect(n.rendaFixa).toEqual([{ id: 'salario', nome: 'Salário', valor: 6500 }]); // 6000 + 1500 ÷ 3
    expect(['renda', 'ifood', 'freela'].some((k) => k in n)).toBe(false);
    expect(n.orcamento.some((l) => 'diario' in l)).toBe(false);
  });
  it('2º formato: as pastas viram categorias (id repetido ganha outro) e as totais não mudam', () => {
    const segundo = {
      ...config,
      grupos: [
        { id: 'saude', nome: 'Saúde', pai: null },
        { id: 'luz', nome: 'Contas', pai: null }, // mesmo id de uma categoria
      ],
      orcamento: [
        { id: 'plano-saude', nome: 'Plano de saúde', valor: 300, natureza: 'fixo', pai: 'saude', tipo: 'conta' },
        { id: 'farmacia', nome: 'Farmácia', valor: 100, natureza: 'fixo', pai: 'saude', tipo: 'envelope' },
        { id: 'luz', nome: 'Luz', valor: 100, natureza: 'fixo', pai: 'luz', tipo: 'conta' },
        { id: 'lazer', nome: 'Lazer', valor: 400, natureza: 'diversao', pai: null, tipo: 'envelope' },
      ],
    } as unknown as Config;
    const n = migrarConfig(segundo);
    expect(n.orcamento.map((l) => [l.id, l.pai, l.valor, l.natureza])).toEqual([
      ['saude', null, 0, 'fixo'], // tudo dentro é fixo
      ['luz-2', null, 0, 'fixo'],
      ['plano-saude', 'saude', 300, 'fixo'],
      ['farmacia', 'saude', 100, 'fixo'],
      ['luz', 'luz-2', 100, 'fixo'],
      ['lazer', null, 400, 'flexivel'],
    ]);
    expect('grupos' in n).toBe(false);
    expect(n.orcamento.reduce((s, l) => s + l.valor, 0)).toBe(300 + 100 + 100 + 400);
  });
  it('tipos antigos (variável, diversão) viram flexível; fixo continua', () => {
    const velho = {
      ...config,
      orcamento: config.orcamento.map((l) => (l.id === 'lazer' ? { ...l, natureza: 'diversao' } : l.id === 'ifood' ? { ...l, natureza: 'variavel' } : l)),
    } as unknown as Config;
    const n = migrarConfig(velho);
    expect(n).not.toBe(velho);
    expect(['lazer', 'ifood', 'aluguel', 'ipva'].map((id) => n.orcamento.find((l) => l.id === id)?.natureza)).toEqual([
      'flexivel',
      'flexivel',
      'fixo',
      'pontual',
    ]);
    expect(migrarConfig(n)).toBe(n);
  });
  it('conta/envelope e dia de vencimento (nada usava) saem', () => {
    const velho = { ...config, orcamento: config.orcamento.map((l) => (l.id === 'luz' ? { ...l, tipo: 'conta', dia: 20 } : { ...l, tipo: 'envelope' })) } as unknown as Config;
    const n = migrarConfig(velho);
    expect(n.orcamento.some((l) => 'tipo' in l || 'dia' in l)).toBe(false);
    expect(n.orcamento).toEqual(config.orcamento);
    expect(migrarConfig(n)).toBe(n);
  });
  it('rodar de novo não muda nada', () => {
    expect(migrarConfig(m)).toBe(m);
    expect(migrarConfig(config)).toBe(config);
  });
});

describe('árvore de categorias', () => {
  it('filhas, caminho, o que está dentro (qualquer profundidade) e o plano somado', () => {
    expect(filhas(config, 'casa').map((l) => l.id)).toEqual(['contas-da-casa', 'aluguel', 'mercado']);
    expect(caminho(config, 'luz').map((l) => l.nome)).toEqual(['Casa', 'Contas da casa', 'Luz']);
    expect([...descendentes(config, 'casa')].sort()).toEqual(['agua', 'aluguel', 'casa', 'contas-da-casa', 'internet', 'luz', 'mercado']);
    expect(planoTotal(config, 'contas-da-casa')).toBe(100 + 60 + 100);
    expect(temFilhas(config, 'casa')).toBe(true);
    expect(temFilhas(config, 'luz')).toBe(false);
  });

  it('linhas visíveis (editor estilo Finder): ordem alfabética, as fechadas escondem o que tem dentro', () => {
    const tudo = linhasVisiveis(config, new Set());
    expect(tudo.slice(0, 3).map((v) => [v.linha.id, v.nivel, v.temFilhas, v.aberta])).toEqual([
      ['casa', 0, true, true],
      ['aluguel', 1, false, false],
      ['contas-da-casa', 1, true, true],
    ]);
    expect(tudo).toHaveLength(config.orcamento.length);
    const fechada = linhasVisiveis(config, new Set(['casa']));
    expect(fechada[0]).toMatchObject({ nivel: 0, aberta: false });
    expect(fechada[1].linha.id).toBe('comida');
  });

  it('lista com gasto: maior primeiro em cada nível, as sem gasto no fim (em ordem alfabética)', () => {
    const valor = new Map([
      ['casa', 2300],
      ['aluguel', 1500],
      ['mercado', 800],
      ['comida', 500],
      ['ifood', 500],
    ]);
    const l = linhasVisiveis(config, new Set(), { valor });
    expect(l.slice(0, 7).map((v) => [v.linha.id, v.vazia])).toEqual([
      ['casa', false],
      ['aluguel', false],
      ['mercado', false],
      ['contas-da-casa', true],
      ['agua', true],
      ['internet', true],
      ['luz', true],
    ]);
    expect(l.filter((v) => v.nivel === 0).map((v) => v.linha.id)).toEqual(['casa', 'comida', 'educacao', 'lazer', 'pessoal', 'saude', 'transporte']);
  });

  it('sem as vazias: some quem não teve gasto (a de cima continua se algo dentro teve), menos as que precisam ficar', () => {
    const valor = new Map([
      ['casa', 1500],
      ['aluguel', 1500],
    ]);
    const l = linhasVisiveis(config, new Set(), { valor, semVazias: true });
    expect(l.map((v) => [v.linha.id, v.temFilhas])).toEqual([
      ['casa', true],
      ['aluguel', false],
    ]);
    expect(linhasVisiveis(config, new Set(), { valor, semVazias: true, manter: new Set(['pessoal']) }).map((v) => v.linha.id)).toContain('pessoal');
  });

  it('filtro por tipo: só as do tipo e as de cima delas', () => {
    const l = linhasVisiveis(config, new Set(), { natureza: 'pontual' });
    expect(l.map((v) => [v.linha.id, v.nivel, v.temFilhas])).toEqual([
      ['pessoal', 0, true],
      ['presentes', 1, false],
      ['saude', 0, true],
      ['dentista', 1, false],
      ['transporte', 0, true],
      ['ipva', 1, false],
    ]);
  });

  it('pôr uma categoria dentro de outra qualquer (até de uma que não tinha nada dentro)', () => {
    const c = mover(config, ['ifood'], 'restaurante');
    expect(caminho(c, 'ifood').map((l) => l.id)).toEqual(['comida', 'restaurante', 'ifood']);
    expect(temFilhas(c, 'restaurante')).toBe(true);
    expect(planoTotal(c, 'restaurante')).toBe(400 + 200);
    expect(planoTotal(c, 'comida')).toBe(planoTotal(config, 'comida')); // o total de cima não muda
    expect(mover(c, ['ifood'], null).orcamento.find((l) => l.id === 'ifood')?.pai).toBeNull();
  });

  it('não deixa pôr uma categoria dentro dela mesma (nem dentro de uma das suas)', () => {
    expect(() => mover(config, ['casa'], 'luz')).toThrow();
    expect(() => mover(config, ['casa'], 'casa')).toThrow();
    const lista = listaEmArvore(config, ['casa']).map((p) => p.id);
    expect(lista).toContain(null);
    expect(lista).not.toContain('contas-da-casa');
    expect(lista).not.toContain('casa');
    expect(lista).toContain('comida');
  });

  it('criar, renomear, mudar plano/tipo/nota (nome vazio não apaga o nome)', () => {
    expect(nomeLivre(config, 'Nova categoria')).toBe('Nova categoria');
    const { config: c, id } = criar(config, nomeLivre(config, 'Nova categoria'), 'fixo');
    expect(c.orcamento.at(-1)).toEqual({ id: 'nova-categoria', nome: 'Nova categoria', valor: 0, natureza: 'fixo', pai: null });
    expect(nomeLivre(c, 'Nova categoria')).toBe('Nova categoria 2');
    const e = editar(c, id, { nome: '  Pet  ', valor: 90, natureza: 'pontual', nota: 'ração' });
    expect(e.orcamento.find((l) => l.id === id)).toMatchObject({ nome: 'Pet', valor: 90, natureza: 'pontual', nota: 'ração' });
    const semNome = editar(e, id, { nome: '   ', nota: '' });
    expect(semNome.orcamento.find((l) => l.id === id)?.nome).toBe('Pet');
    expect(semNome.orcamento.find((l) => l.id === id)).not.toHaveProperty('nota');
  });

  it('juntar: lançamentos e regras vão para o destino, valor somado', () => {
    const ts = [t('DENT', { linha: 'dentista' }), t('FARM', { linha: 'farmacia' }), t('X', { linha: 'luz' })];
    const regras = [{ padrao: 'SORRISO', linha: 'dentista' }, { padrao: 'DROGA', linha: 'farmacia' }];
    const r = mesclar({ config, transacoes: ts, regras }, ['dentista'], 'farmacia');
    expect(r.config.orcamento.some((l) => l.id === 'dentista')).toBe(false);
    expect(r.config.orcamento.find((l) => l.id === 'farmacia')?.valor).toBe(40 + 100);
    expect(r.transacoes.map((x) => x.linha)).toEqual(['farmacia', 'farmacia', 'luz']);
    expect(r.regras[0].linha).toBe('farmacia');
    expect([r.lancamentos, r.regrasMudadas]).toEqual([1, 1]);
    expect(mesclar({ config, transacoes: ts, regras }, ['restaurante'], 'ifood').config.orcamento.find((l) => l.id === 'ifood')?.valor).toBe(200 + 400);
  });

  it('juntar uma que tem outras dentro: as de dentro passam para o destino', () => {
    const r = mesclar({ config, transacoes: [], regras: [] }, ['contas-da-casa'], 'mercado');
    expect(filhas(r.config, 'mercado').map((l) => l.id)).toEqual(['luz', 'agua', 'internet']);
    expect(planoTotal(r.config, 'casa')).toBe(planoTotal(config, 'casa'));
  });

  it('juntar escolhendo o nome: fica a do nome escolhido; "outro nome" renomeia a que fica', () => {
    const ts = [t('DENT', { linha: 'dentista' }), t('FARM', { linha: 'farmacia' })];
    const d = { config, transacoes: ts, regras: [] };
    const a = juntar(d, 'farmacia', 'dentista');
    expect(a.config.orcamento.find((l) => l.id === 'dentista')).toMatchObject({ nome: 'Dentista e check-up', valor: 140, pai: 'saude', natureza: 'pontual' });
    expect(a.transacoes.every((x) => x.linha === 'dentista')).toBe(true);
    const b = juntar(d, 'dentista', 'farmacia', 'Cuidados');
    expect(b.config.orcamento.some((l) => l.id === 'dentista')).toBe(false);
    expect(b.config.orcamento.find((l) => l.id === 'farmacia')?.nome).toBe('Cuidados');
  });

  it('juntar com uma que está dentro dela: o destino sobe e fica com o resto dentro', () => {
    const r = mesclar({ config, transacoes: [], regras: [] }, ['casa'], 'luz');
    const luz = r.config.orcamento.find((l) => l.id === 'luz')!;
    expect(luz.pai).toBeNull();
    expect(caminho(r.config, 'agua').map((l) => l.id)).toEqual(['luz', 'contas-da-casa', 'agua']);
    expect(filhas(r.config, 'luz').map((l) => l.id).sort()).toEqual(['aluguel', 'contas-da-casa', 'mercado']);
    expect(planoTotal(r.config, 'luz')).toBe(planoTotal(config, 'casa'));
  });

  it('excluir: as de dentro sobem, lançamentos e regras vão para onde você escolher', () => {
    const ts = [t('VOLTARA', { linha: 'luz', editado: true }), t('X', { linha: 'contas-da-casa' }), t('Y', { linha: 'aluguel' })];
    const regras = [{ padrao: 'VOLTARA', linha: 'luz' }, { padrao: 'ALUGUEL', linha: 'aluguel' }];
    const d = { config, transacoes: ts, regras };
    const r = excluir(d, ['contas-da-casa'], 'casa');
    expect(r.config.orcamento.some((l) => l.id === 'contas-da-casa')).toBe(false);
    expect(filhas(r.config, 'casa').map((l) => l.id)).toEqual(['aluguel', 'luz', 'agua', 'internet', 'mercado']);
    expect(r.transacoes.map((x) => x.linha)).toEqual(['luz', 'casa', 'aluguel']);
    expect(r.lancamentos).toBe(1);

    const semDestino = excluir(d, ['luz'], null);
    expect(semDestino.transacoes[0].linha).toBeNull();
    expect(semDestino.transacoes[0].editado).toBeUndefined(); // volta para "a categorizar"
    expect(semDestino.regras).toEqual([{ padrao: 'ALUGUEL', linha: 'aluguel' }]);

    const comDestino = excluir(d, ['luz'], 'internet');
    expect(comDestino.transacoes[0]).toMatchObject({ linha: 'internet', editado: true });
    expect(comDestino.regras[0].linha).toBe('internet');

    expect(() => excluir(d, ['luz'], 'luz')).toThrow();
    // excluir a de cima e a de dentro juntas: o que está mais dentro sobe até a primeira que fica
    expect(caminho(excluir(d, ['casa', 'contas-da-casa'], null).config, 'luz').map((l) => l.id)).toEqual(['luz']);
  });

  it('regra nova substitui só a do mesmo padrão E mesma faixa de valor', () => {
    const r = incluirRegra([{ padrao: 'LOJA CENTRAL', valorMin: 150, linha: 'presentes' }, { padrao: 'LOJA CENTRAL', linha: 'mercado' }], {
      padrao: 'LOJA CENTRAL',
      linha: 'lazer',
    });
    expect(r).toEqual([{ padrao: 'LOJA CENTRAL', linha: 'lazer' }, { padrao: 'LOJA CENTRAL', valorMin: 150, linha: 'presentes' }]);
  });
});
