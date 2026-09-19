// Markdown mínimo para as respostas do copiloto (sem HTML cru: tudo vira elemento React).
import type { ReactNode } from 'react';

function inline(texto: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const t = m[0];
    const k = `${chave}-${i++}`;
    if (t.startsWith('**')) partes.push(<strong key={k} className="font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) partes.push(<code key={k} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, rotulo, url] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      partes.push(
        <a key={k} href={url} target="_blank" rel="noreferrer" className="text-accent-strong underline underline-offset-2">
          {rotulo}
        </a>,
      );
    } else partes.push(<em key={k}>{t.slice(1, -1)}</em>);
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

type Bloco =
  | { tipo: 'p'; linhas: string[] }
  | { tipo: 'titulo'; nivel: number; texto: string }
  | { tipo: 'ul' | 'ol'; itens: string[] }
  | { tipo: 'citacao'; linhas: string[] }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'tabela'; linhas: string[][] }
  | { tipo: 'linha' };

const ITEM = /^\s*[-*•]\s+/;
const NUMERO = /^\s*\d+[.)]\s+/;
const ESPECIAL = /^\s*([-*•]\s|\d+[.)]\s|\||#{1,6}\s|>|```)/;
const SEPARADOR = /^\s*([-*_])(\s*\1){2,}\s*$/;

function blocos(texto: string): Bloco[] {
  const r: Bloco[] = [];
  const linhas = texto.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) {
      i++;
    } else if (/^\s*```/.test(l)) {
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i])) corpo.push(linhas[i++]);
      i++; // fecha (ou acabou o texto, enquanto ainda chega)
      r.push({ tipo: 'codigo', texto: corpo.join('\n') });
    } else if (SEPARADOR.test(l)) {
      r.push({ tipo: 'linha' });
      i++;
    } else if (ITEM.test(l) || NUMERO.test(l)) {
      const re = ITEM.test(l) ? ITEM : NUMERO;
      const itens: string[] = [];
      while (i < linhas.length && re.test(linhas[i])) itens.push(linhas[i++].replace(re, ''));
      r.push({ tipo: re === ITEM ? 'ul' : 'ol', itens });
    } else if (/^\s*\|/.test(l)) {
      const tabela: string[][] = [];
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) {
        const cel = linhas[i++].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cel.every((c) => /^:?-{2,}:?$/.test(c))) tabela.push(cel);
      }
      r.push({ tipo: 'tabela', linhas: tabela });
    } else if (/^#{1,6}\s/.test(l)) {
      r.push({ tipo: 'titulo', nivel: l.match(/^#+/)![0].length, texto: l.replace(/^#{1,6}\s+/, '') });
      i++;
    } else if (/^\s*>/.test(l)) {
      const corpo: string[] = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) corpo.push(linhas[i++].replace(/^\s*>\s?/, ''));
      r.push({ tipo: 'citacao', linhas: corpo });
    } else {
      const par: string[] = [];
      while (i < linhas.length && linhas[i].trim() && !ESPECIAL.test(linhas[i]) && !SEPARADOR.test(linhas[i])) par.push(linhas[i++]);
      if (!par.length) par.push(linhas[i++]);
      r.push({ tipo: 'p', linhas: par });
    }
  }
  return r;
}

const numero = (c: string) => /^[-−+]?\s*(R\$\s*)?[-−+]?[\d.,]+\s*%?$/.test(c);

/** `cursor`: mostra o cursor piscando no fim do texto (resposta ainda chegando). */
export function Markdown({ texto, cursor }: { texto: string; cursor?: boolean }) {
  const lista = blocos(texto);
  const marca = <span key="cursor" className="ml-0.5 inline-block h-[1.05em] w-[0.45em] animate-pulse rounded-[1px] bg-ink-2 align-[-0.18em]" aria-hidden />;
  const fim = (k: number) => (cursor && k === lista.length - 1 ? marca : null);
  const linhasInline = (linhas: string[], k: string) =>
    linhas.flatMap((t, j) => (j ? [<br key={`br${j}`} />, ...inline(t, `${k}-${j}`)] : inline(t, `${k}-${j}`)));

  return (
    <div className="text-sm leading-relaxed [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      {lista.map((b, n) => {
        const k = `b${n}`;
        switch (b.tipo) {
          case 'p':
            return (
              <p key={k} className="my-2">
                {linhasInline(b.linhas, k)}
                {fim(n)}
              </p>
            );
          case 'titulo':
            return (
              <p key={k} className={`mb-1 mt-4 font-semibold ${b.nivel <= 2 ? 'text-[15px]' : ''}`}>
                {inline(b.texto, k)}
                {fim(n)}
              </p>
            );
          case 'ul':
          case 'ol': {
            const Lista = b.tipo;
            return (
              <Lista key={k} className={`my-2 space-y-1 pl-5 marker:text-muted ${b.tipo === 'ul' ? 'list-disc' : 'list-decimal'}`}>
                {b.itens.map((t, j) => (
                  <li key={j} className="pl-0.5">
                    {inline(t, `${k}-${j}`)}
                    {j === b.itens.length - 1 && fim(n)}
                  </li>
                ))}
              </Lista>
            );
          }
          case 'citacao':
            return (
              <blockquote key={k} className="my-2 border-l-2 border-borda pl-3 text-ink-2">
                {linhasInline(b.linhas, k)}
                {fim(n)}
              </blockquote>
            );
          case 'codigo':
            return (
              <pre key={k} className="my-2 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs leading-normal">
                {b.texto}
                {fim(n)}
              </pre>
            );
          case 'linha':
            return <hr key={k} className="my-3 border-borda" />;
          case 'tabela':
            return (
              <div key={k} className="my-2 overflow-x-auto rounded-lg border border-borda">
                <table className="tabular w-full text-xs">
                  <tbody>
                    {b.linhas.map((row, j) => (
                      <tr key={j} className={j === 0 ? 'bg-surface-2 font-semibold' : 'border-t border-borda'}>
                        {row.map((c, x) => (
                          <td key={x} className={`px-2 py-1.5 align-top ${j > 0 && numero(c) ? 'whitespace-nowrap text-right' : ''}`}>
                            {inline(c, `${k}-${j}-${x}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fim(n)}
              </div>
            );
        }
      })}
      {cursor && !lista.length && marca}
    </div>
  );
}
