#!/bin/bash
# Gera GestaoEscolar.app (macOS): um executável único (Node + código, sem precisar de "npm install"
# na máquina de destino) dentro de um pacote .app normal. A base de dados MySQL continua a ser
# preciso instalar e ligar à parte (ver README) — isto só embrulha a aplicação Node.
set -euo pipefail
cd "$(dirname "$0")/.."

SAIDA="build/mac"
APP="$SAIDA/GestaoEscolar.app"
FUSE="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
NODE_VERSAO="v26.10.0"

# O "single executable application" do Node tem de vir de um build oficial: o Node do Homebrew
# (o que está em PATH neste Mac) foi compilado SEM esse suporte. Descarrega-se uma vez para
# .build-tools/ e fica em cache; não mexe no `node` normal do sistema.
ARQ="$(uname -m)"; [ "$ARQ" = "arm64" ] && ARQ_NODE="arm64" || ARQ_NODE="x64"
NODE_OFICIAL_DIR=".build-tools/node-${NODE_VERSAO}-darwin-${ARQ_NODE}"
NODE_OFICIAL="$NODE_OFICIAL_DIR/bin/node"
if [ ! -x "$NODE_OFICIAL" ]; then
  echo "==> A descarregar o Node oficial ${NODE_VERSAO} (só para o build, uma vez)"
  mkdir -p .build-tools
  curl -sL --fail -o .build-tools/node-oficial.tar.gz \
    "https://nodejs.org/dist/${NODE_VERSAO}/node-${NODE_VERSAO}-darwin-${ARQ_NODE}.tar.gz"
  tar -xzf .build-tools/node-oficial.tar.gz -C .build-tools
  rm .build-tools/node-oficial.tar.gz
fi
if [ "$("$NODE_OFICIAL" -p 'process.config.variables.single_executable_application')" != "true" ]; then
  echo "Erro: este Node oficial não tem o \"single executable application\" ativado." >&2
  exit 1
fi

echo "==> A limpar $SAIDA"
rm -rf "$SAIDA"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "==> A juntar o código todo num único ficheiro (esbuild)"
npx esbuild src/app.js --bundle --platform=node --format=cjs --outfile="$SAIDA/bundle.cjs"

echo "==> A gerar o blob do executável único (node --experimental-sea-config)"
cat > "$SAIDA/sea-config.json" <<EOF
{
  "main": "$SAIDA/bundle.cjs",
  "output": "$SAIDA/sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
EOF
"$NODE_OFICIAL" --experimental-sea-config "$SAIDA/sea-config.json"

echo "==> A copiar o binário do Node e a injetar o código"
BIN="$APP/Contents/MacOS/gestao-escolar-bin"
cp "$NODE_OFICIAL" "$BIN"
codesign --remove-signature "$BIN"
npx postject "$BIN" NODE_SEA_BLOB "$SAIDA/sea-prep.blob" \
  --sentinel-fuse "$FUSE" \
  --macho-segment-name NODE_SEA

echo "==> A copiar os recursos (public/, database/, favicon)"
cp -R public "$APP/Contents/Resources/public"
cp -R database "$APP/Contents/Resources/database"

echo "==> A escrever o Info.plist e o lançador"
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Gestão Escolar</string>
  <key>CFBundleDisplayName</key><string>Gestão Escolar</string>
  <key>CFBundleIdentifier</key><string>pt.epmontijo.gestaoescolar</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>GestaoEscolar</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF

cat > "$APP/Contents/MacOS/GestaoEscolar" <<'EOF'
#!/bin/bash
# Lançador: arranca o servidor em segundo plano e abre o browser.
# Para mudar a ligação à base de dados (porta do MySQL, por exemplo), crie o ficheiro
# ~/Library/Application Support/GestaoEscolar/config.env com, por exemplo: DB_PORT=3120
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$HOME/Library/Application Support/GestaoEscolar/config.env"
[ -f "$CONFIG" ] && source "$CONFIG"
LOGDIR="$HOME/Library/Logs"
mkdir -p "$LOGDIR"
export PORT="${PORT:-3000}"
"$DIR/gestao-escolar-bin" >>"$LOGDIR/GestaoEscolar.log" 2>&1 &
PID=$!
sleep 1.5
open "http://localhost:${PORT}" || true
wait "$PID"
EOF
chmod +x "$APP/Contents/MacOS/GestaoEscolar" "$BIN"

echo "==> A assinar (ad-hoc, só para correr localmente)"
codesign --force --deep --sign - "$APP"

echo "==> Pronto: $APP"
echo "    (Ainda precisa de MySQL a correr à parte — ver README)"
