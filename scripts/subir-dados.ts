// Leva os dados do Mac (data/*.json) para a Vercel Blob, um a um. Nada é apagado daqui.
//   npm run subir-dados -- --simular     só mostra o que faria
//   npm run subir-dados                  sobe o que ainda não está lá
//   npm run subir-dados -- --substituir  sobe também por cima do que já está lá (o da nuvem se perde)
import { ARQUIVOS } from '../src/lib/tipos.ts';
import { depositoArquivo, depositoDaNuvem, variavel } from '../server/deposito.ts';

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const substituir = args.includes('--substituir');

if (!variavel('BLOB_READ_WRITE_TOKEN')) {
  console.error('Falta o BLOB_READ_WRITE_TOKEN (no .env.local ou no ambiente). Sem ele não dá para falar com a store.');
  process.exit(1);
}

const kb = (texto: string) => `${(Buffer.byteLength(texto) / 1024).toFixed(1)} kB`;

const nuvem = await depositoDaNuvem();
let subiram = 0;
let pulados = 0;

for (const nome of ARQUIVOS) {
  const aqui = await depositoArquivo.ler(nome);
  if (!aqui) {
    console.log(`${nome}: não existe em data/ — pulei`);
    continue;
  }
  const la = await nuvem.ler(nome);
  if (la && la.texto === aqui.texto) {
    console.log(`${nome}: igual na nuvem (${kb(aqui.texto)}) — nada a fazer`);
    continue;
  }
  if (la && !substituir) {
    console.log(`${nome}: já existe na nuvem e está diferente (lá ${kb(la.texto)}, aqui ${kb(aqui.texto)}) — pulei; use --substituir para gravar por cima`);
    pulados++;
    continue;
  }
  if (simular) {
    console.log(`${nome}: subiria ${kb(aqui.texto)}${la ? ' por cima do que está lá' : ''}`);
    subiram++;
    continue;
  }
  const r = await nuvem.gravar(nome, aqui.texto);
  if (!r.ok) {
    console.log(`${nome}: alguém gravou antes — não subiu`);
    pulados++;
    continue;
  }
  console.log(`${nome}: subiu ${kb(aqui.texto)}`);
  subiram++;
}

console.log(
  simular
    ? `\nSimulação: ${subiram} arquivo(s) subiriam${pulados ? `, ${pulados} pulado(s)` : ''}. Rode de novo sem --simular.`
    : `\n${subiram} arquivo(s) na nuvem${pulados ? `, ${pulados} pulado(s)` : ''}.`,
);
