// Abre o app no Mac já liberado para o iPhone (mesma Wi-Fi) e mostra o QR code no Terminal.
// Usado pelo atalho "Minha Economia" da Mesa. Uso: npm run abrir
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import QRCode from 'qrcode';

const PORTA = 5180;
const emUso = await new Promise<boolean>((resolve) => {
  const s = net.connect(PORTA, '127.0.0.1');
  s.on('connect', () => {
    s.end();
    resolve(true);
  });
  s.on('error', () => resolve(false));
});

let nome = os.hostname().replace(/\.local$/, '');
try {
  nome = execFileSync('scutil', ['--get', 'LocalHostName']).toString().trim();
} catch {
  /* fica o hostname */
}
const url = `http://${nome}.local:${PORTA}/`;

console.log('\n  Minha Economia\n');
console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
console.log(`  No iPhone (mesma Wi-Fi): aponte a câmera para o QR ou abra ${url}`);
console.log('  Deixe esta janela aberta enquanto usa o app. Para desligar: feche a janela.\n');

if (emUso) {
  console.log('  O app já estava rodando — abrindo no navegador.');
  spawn('open', [`http://localhost:${PORTA}/`]);
  process.exit(0);
}

const vite = spawn('npx', ['vite', '--host', '--clearScreen', 'false'], { stdio: ['inherit', 'ignore', 'inherit'] });
setTimeout(() => spawn('open', [`http://localhost:${PORTA}/`]), 2500);
vite.on('exit', (codigo) => process.exit(codigo ?? 0));
