// Como abrir o app no iPhone: QR code com o nome do Mac na rede (não muda quando o IP muda).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Smartphone } from 'lucide-react';
import { Ajuda, Card, TituloPagina } from '../components/ui';

interface Rede {
  nome: string;
  ip: string | null;
  porta: number;
  exposto: boolean;
}

export function Celular() {
  const [rede, setRede] = useState<Rede | null>(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    fetch('/api/rede')
      .then((r) => r.json())
      .then(async (r: Rede) => {
        setRede(r);
        const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
        setQr(
          await QRCode.toDataURL(`http://${r.nome}:${r.porta}/`, {
            margin: 1,
            width: 480,
            color: escuro ? { dark: '#ffffffff', light: '#1a1a19ff' } : { dark: '#0b0b0bff', light: '#fcfcfbff' },
          }),
        );
      })
      .catch(() => setRede(null));
  }, []);

  const endereco = rede ? `http://${rede.nome}:${rede.porta}` : '…';

  return (
    <div className="space-y-3">
      <TituloPagina>
        <span className="flex items-center gap-2">
          Abrir no celular
          <Ajuda>
            Mac ligado, com o app aberto, e o iPhone na mesma Wi-Fi. Aponte a câmera para o QR; no Safari, Compartilhar → Adicionar à Tela de
            Início. Se o Mac perguntar se o "node" aceita conexões, Permitir.
          </Ajuda>
        </span>
      </TituloPagina>

      {rede && !rede.exposto && (
        <Card className="border-warning/60">
          <p className="flex gap-2 text-sm">
            <AlertTriangle size={18} className="shrink-0 text-warning" />
            <span>
              Aberto <strong>só neste Mac</strong>. Abra pelo atalho <strong>Minha Economia</strong> na Mesa (ou{' '}
              <code className="rounded bg-surface-2 px-1">npm run celular</code>).
            </span>
          </p>
        </Card>
      )}

      <Card className="text-center">
        {qr ? (
          <img src={qr} alt={`QR code para ${endereco}`} className="mx-auto w-60 max-w-full rounded-xl" />
        ) : (
          <div className="mx-auto flex h-60 w-60 items-center justify-center text-muted">
            <Smartphone size={40} />
          </div>
        )}
        <p className="mt-3 text-lg font-semibold">{endereco}</p>
        {rede?.ip && (
          <p className="mt-1 text-xs text-muted">
            ou http://{rede.ip}:{rede.porta}
          </p>
        )}
      </Card>
    </div>
  );
}
