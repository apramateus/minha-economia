#!/bin/bash
# Instala o Minha Economia neste Mac, sem senha de administrador: Node (se faltar), dependências e o atalho na Mesa.
# Uso: bash scripts/instalar-mac.sh (pode rodar de novo quantas vezes quiser).
# MINHA_ECONOMIA_ATALHO_DIR muda a pasta do atalho (padrão: a Mesa).
set -euo pipefail

NODE_MINIMO='22.12'
NODE_BASE='https://nodejs.org/dist/latest-v24.x'

falhar() {
  echo "✗ $*" >&2
  exit 1
}

# versão do node em $1 é >= NODE_MINIMO?
node_serve() {
  local v
  v="$("$1" --version 2>/dev/null)" || return 1
  v="${v#v}"
  local maior="${v%%.*}" resto="${v#*.}"
  local menor="${resto%%.*}"
  [ "$maior" -gt "${NODE_MINIMO%%.*}" ] 2>/dev/null || { [ "$maior" -eq "${NODE_MINIMO%%.*}" ] && [ "$menor" -ge "${NODE_MINIMO#*.}" ]; } 2>/dev/null
}

achar_node() {
  local c
  for c in "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && node_serve "$c" && { echo "$c"; return 0; }
  done
  return 1
}

# Node 24 LTS oficial em $1 (padrão ~/.local/node), com node/npm/npx ligados em $2 (padrão ~/.local/bin)
instalar_node() {
  local destino="${1:-$HOME/.local/node}" bin="${2:-$HOME/.local/bin}" arq
  case "$(uname -m)" in
    arm64) arq='arm64' ;;
    x86_64) arq='x64' ;;
    *) falhar "Processador não reconhecido: $(uname -m)" ;;
  esac
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "$NODE_BASE/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt" || falhar 'Não consegui falar com nodejs.org. A internet está ligada?'
  local linha
  linha="$(grep -E "  node-v24\.[0-9]+\.[0-9]+-darwin-$arq\.tar\.gz\$" "$tmp/SHASUMS256.txt" | head -1 || true)"
  [ -n "$linha" ] || falhar 'Não achei o Node para este Mac em nodejs.org.'
  local soma="${linha%% *}" arquivo="${linha##* }"
  echo "  Baixando ${arquivo}…"
  curl -fL --progress-bar "$NODE_BASE/$arquivo" -o "$tmp/$arquivo" || falhar 'O download do Node falhou. Tente de novo.'
  (cd "$tmp" && echo "$soma  $arquivo" | shasum -a 256 -c - >/dev/null) || falhar 'O arquivo do Node veio corrompido. Tente de novo.'
  rm -rf "$destino.novo"
  mkdir -p "$destino.novo" "$bin"
  tar -xzf "$tmp/$arquivo" -C "$destino.novo" --strip-components 1
  rm -rf "$destino"
  mv "$destino.novo" "$destino"
  local p
  for p in node npm npx; do ln -sfn "$destino/bin/$p" "$bin/$p"; done
  rm -rf "$tmp"
}

# ~/.local/bin no PATH do Terminal (o Claude Code e o Node ficam lá)
ligar_path() {
  local zshrc="$HOME/.zshrc"
  grep -qs '\.local/bin' "$zshrc" && return 0
  printf '\n# Claude Code e Node (Minha Economia)\nexport PATH="$HOME/.local/bin:$PATH"\n' >>"$zshrc"
}

# atalho de dois cliques: $1 = pasta do app, $2 = pasta extra do node no PATH (vazia se for uma das de sempre)
criar_atalho() {
  local dir="${MINHA_ECONOMIA_ATALHO_DIR:-$HOME/Desktop}" pasta="$1" extra="${2:+$2:}"
  local atalho="$dir/Minha Economia.command"
  pasta="${pasta//\\/\\\\}"
  pasta="${pasta//\"/\\\"}"
  pasta="${pasta//\$/\\\$}"
  pasta="${pasta//\`/\\\`}"
  mkdir -p "$dir"
  cat >"$atalho" <<EOF
#!/bin/zsh
# Minha Economia — abre o app no Mac e deixa pronto para o iPhone (mesma Wi-Fi).
# Deixe a janela do Terminal aberta enquanto usa. Para desligar o app, feche a janela.
export PATH="\$HOME/.local/bin:${extra}/opt/homebrew/bin:/usr/local/bin:\$PATH"
cd "$pasta" || { echo "Não achei a pasta do app."; read; exit 1; }
npm run abrir --silent
EOF
  chmod +x "$atalho"
  echo "  $atalho"
}

principal() {
  [ "$(uname -s)" = 'Darwin' ] || falhar 'Este instalador é para Mac.'
  cd "$(dirname "$0")/.."
  local pasta
  pasta="$(pwd)"
  [ -f package.json ] || falhar "Não achei o app em $pasta."
  echo "Minha Economia — instalando em $pasta"

  echo '1/3 Node'
  local node
  if node="$(achar_node)"; then
    echo "  Já tem: $("$node" --version) ($node)"
  else
    instalar_node
    node="$HOME/.local/bin/node"
    echo "  Instalado: $("$node" --version)"
  fi
  local dir_node
  dir_node="$(dirname "$node")"
  export PATH="$dir_node:$HOME/.local/bin:$PATH"
  ligar_path

  echo '2/3 Dependências (npm ci, leva uns minutos)'
  npm ci --no-audit --no-fund --loglevel=error || falhar 'npm ci falhou. Rode o instalador de novo; se repetir, mostre o erro ao Claude.'

  echo '3/3 Atalho'
  case "$dir_node" in "$HOME/.local/bin" | /opt/homebrew/bin | /usr/local/bin) dir_node='' ;; esac
  criar_atalho "$pasta" "$dir_node"

  if ! command -v claude >/dev/null && [ ! -x "$HOME/.local/bin/claude" ]; then
    echo
    echo '⚠ Não achei o Claude Code (comando "claude"). O app funciona, mas o Copiloto precisa dele:'
    echo '  curl -fsSL https://claude.ai/install.sh | bash   e depois   claude   (para entrar)'
  fi
  echo
  echo 'Pronto. Dois cliques em Minha Economia na Mesa.'
}

# "source" deste arquivo só carrega as funções (para testar)
if [ "${BASH_SOURCE[0]}" = "$0" ]; then principal "$@"; fi
