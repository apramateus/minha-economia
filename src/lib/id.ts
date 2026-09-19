// crypto.randomUUID só existe em contexto seguro (https/localhost); no iPhone via IP da Wi-Fi não existe.
export function novoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
