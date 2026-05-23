#!/usr/bin/env bash
#
# Pinpoint installer / updater.
#
# Works two ways:
#   • From the web (no clone needed):
#       curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/install.sh | bash
#   • From a local clone:
#       bun run install:local        (or:  bash scripts/install.sh)
#
# It installs:
#   1. a `pinpoint` shim on PATH (~/.local/bin) that runs the Bun CLI
#   2. the /pinpoint slash command in ~/.claude/commands
#
# Re-run the same command any time to UPDATE — it pulls the latest commit and
# rewrites the shim/command. The whole thing is idempotent.
set -euo pipefail

REPO_URL="${PINPOINT_REPO_URL:-https://github.com/vinitkumargoel/pinpoint.git}"
INSTALL_DIR="${PINPOINT_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/pinpoint}"

say() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required. Install it, then re-run."
command -v bun >/dev/null 2>&1 || die "bun is required (https://bun.sh).
  Install it with:  curl -fsSL https://bun.sh/install | bash
  then re-run this installer."

# --- 1) Resolve the source tree -------------------------------------------
# If this script lives inside a real clone, install from it in place (dev mode).
# Otherwise clone (or update) a managed copy under $INSTALL_DIR.
SELF_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd || true)"
fi

if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/src/index.ts" ] && [ -d "$SELF_DIR/.git" ]; then
  REPO="$SELF_DIR"
  say "→ using local clone: $REPO"
elif [ -d "$INSTALL_DIR/.git" ]; then
  say "→ updating existing install: $INSTALL_DIR"
  BR="$(git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BR" --quiet
  git -C "$INSTALL_DIR" reset --hard "origin/$BR" --quiet
  REPO="$INSTALL_DIR"
else
  say "→ cloning $REPO_URL → $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --quiet "$REPO_URL" "$INSTALL_DIR"
  REPO="$INSTALL_DIR"
fi

# --- 2) Dependencies -------------------------------------------------------
say "→ installing dependencies"
( cd "$REPO" && bun install --silent )

# --- 3) PATH shim ----------------------------------------------------------
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/pinpoint" <<EOF
#!/usr/bin/env bash
exec bun "$REPO/src/index.ts" "\$@"
EOF
chmod +x "$BIN_DIR/pinpoint"
say "✓ CLI:     $BIN_DIR/pinpoint"

# --- 4) Slash command ------------------------------------------------------
CMD_DIR="${HOME}/.claude/commands"
mkdir -p "$CMD_DIR"
cp "$REPO/commands/pinpoint.md" "$CMD_DIR/pinpoint.md"
say "✓ command: $CMD_DIR/pinpoint.md  (/pinpoint <file>)"

# --- 5) Skill (lets Claude know when & how to use Pinpoint) ----------------
SKILL_DIR="${HOME}/.claude/skills/pinpoint"
mkdir -p "$SKILL_DIR"
cp "$REPO/skills/pinpoint/SKILL.md" "$SKILL_DIR/SKILL.md"
say "✓ skill:   $SKILL_DIR/SKILL.md"

# --- 6) PATH check ---------------------------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say "! note: $BIN_DIR is not on your PATH. Add this to your shell profile:"
    say "      export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

say ""
say "done — Pinpoint is ready."
say "  CLI:          pinpoint annotate $REPO/test/fixture/index.html"
say "  Claude Code:  /pinpoint <file.html>"
