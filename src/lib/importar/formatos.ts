// Leitura de arquivos de banco: OFX, CSV genérico e fatura do C6 (CSV).
// Tudo vira `LinhaBruta`, com valor ASSINADO: negativo = dinheiro saiu, positivo = entrou.

export interface LinhaBruta {
  data: string; // AAAA-MM-DD
  valor: number;
  descricao: string;
  idExterno?: string;
  /** hash pronto e estável vindo da fonte (ex.: `pluggy:<id>`) */
  hash?: string;
  /** texto extra só para casar regras (descrição bruta do banco, estabelecimento…) */
  detalhe?: string;
  categoriaBanco?: string;
}

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Descritor de cartão: nome (22 caracteres) + cidade (13) + país, às vezes com parcela no fim. */
export const DESCRITOR_CARTAO = /^(.{22}) .{13} (BRA|USA)(\s+\(\d+\/\d+\))?\s*$/;

/**
 * Só o nome do estabelecimento ou da pessoa, em maiúsculas: tira cidade/país do descritor de cartão,
 * "Pix enviado para", prefixos de maquininha (IFD*, MP*…), números e parcela.
 */
export function nucleoDescricao(descricao: string): string {
  const cartao = descricao.match(DESCRITOR_CARTAO);
  let d = normalizar(cartao ? cartao[1] : descricao);
  d = d.replace(/^(PIX (ENVIADO|RECEBIDO)( C6)? (PARA|DE)|PAGAMENTO BOLETO|COMPRA (NO )?DEBITO)\s+/, '');
  d = d.replace(/\s*\(\d+\/\d+\)$/, '');
  d = d.replace(/^MERCADOLIVRE\s*\*\s*/, 'MERCADO LIVRE ');
  d = d.replace(/^(IFD|MP|DL|EBN|DM|PAG|PG|MERCADO)\s*\*\s*/, '');
  return d.replace(/\b\d[\d.]*\b/g, '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Decodifica bytes em UTF-8; se não for UTF-8 válido, usa Windows-1252 (comum em bancos). */
export function decodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^﻿/, '');
}

// ---------- Valores e datas brasileiros ----------

export function parseValor(s: string): number | null {
  let v = s.trim().replace(/R\$|\s/g, '');
  if (!v) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(v)) {
    negativo = true;
    v = v.slice(1, -1);
  }
  if (v.startsWith('-')) {
    negativo = !negativo;
    v = v.slice(1);
  } else if (v.startsWith('+')) v = v.slice(1);

  const ultVirg = v.lastIndexOf(',');
  const ultPonto = v.lastIndexOf('.');
  if (ultVirg >= 0 && ultPonto >= 0) {
    v = ultVirg > ultPonto ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else if (ultVirg >= 0) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
    v = v.replace(/\./g, ''); // "1.234" = mil duzentos e trinta e quatro
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

export function parseData(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20260915120000[-3:BRT]
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// ---------- OFX ----------

export function ehOFX(texto: string): boolean {
  return /<OFX>|OFXHEADER/i.test(texto.slice(0, 2000));
}

export function lerOFX(texto: string): LinhaBruta[] {
  const linhas: LinhaBruta[] = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  const tag = (b: string, nome: string) => b.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
  for (const b of blocos) {
    const data = parseData(tag(b, 'DTPOSTED'));
    const valor = parseValor(tag(b, 'TRNAMT').replace(',', '.'));
    if (!data || valor === null) continue;
    const descricao = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' — ') || 'Sem descrição';
    linhas.push({ data, valor, descricao, idExterno: tag(b, 'FITID') || undefined });
  }
  return linhas;
}

// ---------- CSV ----------

export function lerCSV(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', ',', '\t'].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha.map((c) => c.trim()));
      linha = [];
      campo = '';
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha.map((c) => c.trim()));
  return linhas;
}

export interface Mapeamento {
  data: number;
  descricao: number;
  valor: number;
  /** colunas extras juntadas à descrição (ex.: parcela) */
  extras?: number[];
  /** fatura de cartão: valores positivos são compras (saída de dinheiro) */
  positivoEhGasto: boolean;
}

/** Fatura CSV do C6: Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$) */
export function mapeamentoC6Fatura(cab: string[]): Mapeamento | null {
  const n = cab.map(normalizar);
  const data = n.indexOf('DATA DE COMPRA');
  const descricao = n.indexOf('DESCRICAO');
  const valor = n.findIndex((c) => c.startsWith('VALOR (EM R$)'));
  if (data < 0 || descricao < 0 || valor < 0) return null;
  const parcela = n.indexOf('PARCELA');
  return { data, descricao, valor, extras: parcela >= 0 ? [parcela] : [], positivoEhGasto: true };
}

/** Tenta adivinhar as colunas pelos nomes do cabeçalho. */
export function adivinharMapeamento(cab: string[]): Partial<Mapeamento> {
  const n = cab.map(normalizar);
  const achar = (re: RegExp) => n.findIndex((c) => re.test(c));
  const r: Partial<Mapeamento> = {};
  const data = achar(/^DATA/);
  const descricao = achar(/DESCRI|HISTORICO|ESTABELECIMENTO|LANCAMENTO|TITULO|MEMO|DETALHE/);
  let valor = achar(/VALOR.*R\$/);
  if (valor < 0) valor = achar(/VALOR|QUANTIA|MONTANTE/);
  if (data >= 0) r.data = data;
  if (descricao >= 0) r.descricao = descricao;
  if (valor >= 0) r.valor = valor;
  return r;
}

export function linhasDoCSV(tabela: string[][], map: Mapeamento): LinhaBruta[] {
  const r: LinhaBruta[] = [];
  for (const row of tabela.slice(1)) {
    const data = parseData(row[map.data] ?? '');
    const bruto = parseValor(row[map.valor] ?? '');
    if (!data || bruto === null || bruto === 0) continue;
    const extras = (map.extras ?? [])
      .map((i) => row[i] ?? '')
      .filter((x) => x && !/^UNICA$/.test(normalizar(x)));
    const descricao = [row[map.descricao] ?? '', ...extras].filter(Boolean).join(' — ') || 'Sem descrição';
    r.push({ data, valor: map.positivoEhGasto ? -bruto : bruto, descricao });
  }
  return r;
}
