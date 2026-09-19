// Datas sempre no fuso local, no formato AAAA-MM-DD (dia) e AAAA-MM (mês).

const p2 = (n: number) => String(n).padStart(2, '0');

export function isoDia(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function isoMes(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

export function deIsoDia(s: string): Date {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  return isoMes(new Date(a, m - 1 + n, 1));
}

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/** Os N meses completos anteriores a `mes` (do mais antigo ao mais recente). */
export function mesesAnteriores(mes: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarMeses(mes, i - n));
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function nomeMesCurto(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES_CURTOS[m - 1]}/${a}`;
}

export function nomeMesLongo(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES_LONGOS[m - 1]} de ${a}`;
}

export function dataCurta(dia: string): string {
  const [, m, d] = dia.split('-').map(Number);
  return `${p2(d)}/${p2(m)}`;
}
