#!/usr/bin/env bash
#
# Install Pinpoint for local use with Claude Code:
#   1. a `pinpoint` shim on PATH (~/.local/bin) that runs the Bun CLI
#   2. the /pinpoint slash command in ~/.claude/commands
#
# Re-run any time after pulling changes — it's idempotent.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is not installed or not on PATH. See https://bun.sh" >&2
  exit 1
fi

# 1) PATH shim --------------------------------------------------------------
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/pinpoint" <<EOF
#!/usr/bin/env bash
exec bun "$REPO/src/index.ts" "\$@"
EOF
chmod +x "$BIN_DIR/pinpoint"
echo "✓ installed CLI: $BIN_DIR/pinpoint  →  bun $REPO/src/index.ts"

# 2) Slash command ----------------------------------------------------------
CMD_DIR="${HOME}/.claude/commands"
mkdir -p "$CMD_DIR"
cp "$REPO/commands/pinpoint.md" "$CMD_DIR/pinpoint.md"
echo "✓ installed command: $CMD_DIR/pinpoint.md  (use /pinpoint <file.html>)"

# 3) PATH check -------------------------------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "! note: $BIN_DIR is not on your PATH — add it to use 'pinpoint' directly." ;;
esac

echo "done. Try:  pinpoint annotate $REPO/test/fixture/index.html"
