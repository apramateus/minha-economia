const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const brl = (v: number) => fmtBRL.format(v);
/** Sem centavos, para números grandes e resumos. */
export const brl0 = (v: number) => fmtBRL0.format(v);
export const num = (v: number) => fmtNum.format(v);

/** Converte o que a pessoa digitou ("12,50", "1.200", "R$ 45") em número. */
export function lerValor(s: string): number | null {
  const t = s.replace(/R\$|\s/g, '');
  if (!t) return null;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : null;
}

export function valorParaCampo(v: number | undefined): string {
  if (v === undefined || v === null) return '';
  return String(v).replace('.', ',');
}
