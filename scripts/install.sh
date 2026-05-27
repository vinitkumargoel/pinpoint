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

# --- 0) Platform + prerequisites ------------------------------------------
case "$(uname -s 2>/dev/null)" in
  Darwin|Linux) ;;
  MINGW*|MSYS*|CYGWIN*)
    die "Windows is not supported directly. Run this installer inside WSL2 (https://aka.ms/wsl)." ;;
  *)
    say "! warning: untested platform ($(uname -s)). Continuing — please report any failures." ;;
esac

command -v git >/dev/null 2>&1 || die "git is required. Install it, then re-run."

# Auto-install Bun if missing. Skipped when PINPOINT_SKIP_BUN_INSTALL=1.
if ! command -v bun >/dev/null 2>&1; then
  if [ "${PINPOINT_SKIP_BUN_INSTALL:-0}" = "1" ]; then
    die "bun is required (https://bun.sh) and PINPOINT_SKIP_BUN_INSTALL=1 is set.
  Install it with:  curl -fsSL https://bun.sh/install | bash
  then re-run this installer."
  fi
  say "→ bun not found — installing from https://bun.sh/install"
  curl -fsSL https://bun.sh/install | bash >&2 || die "bun install failed. Install it manually from https://bun.sh and re-run."
  # The bun installer drops the binary at ~/.bun/bin/bun and updates shell
  # profiles, but the new PATH isn't visible in this shell yet.
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  command -v bun >/dev/null 2>&1 || die "bun was installed but is not on PATH. Open a new shell and re-run."
  say "✓ bun installed at $(command -v bun)"
fi

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

# --- 2) Dependencies + UI build --------------------------------------------
say "→ installing dependencies"
( cd "$REPO" && bun install )
say "→ building annotator UI"
( cd "$REPO" && bun run build:ui )

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

# --- 6) PATH setup ---------------------------------------------------------
# If $BIN_DIR isn't on PATH, append the export to the user's shell profile so
# `pinpoint` and `/pinpoint` work in their next shell. Skipped when
# PINPOINT_SKIP_PATH_EDIT=1.
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    if [ "${PINPOINT_SKIP_PATH_EDIT:-0}" = "1" ]; then
      say "! note: $BIN_DIR is not on your PATH. Add this to your shell profile:"
      say "      export PATH=\"\$HOME/.local/bin:\$PATH\""
    else
      # Pick a profile to edit based on the user's login shell.
      case "$(basename "${SHELL:-}")" in
        zsh)  PROFILE="$HOME/.zshrc" ;;
        bash) PROFILE="${HOME}/.bashrc"; [ -f "$HOME/.bash_profile" ] && PROFILE="$HOME/.bash_profile" ;;
        fish) PROFILE="$HOME/.config/fish/config.fish" ;;
        *)    PROFILE="$HOME/.profile" ;;
      esac
      LINE='export PATH="$HOME/.local/bin:$PATH"'
      [ "$(basename "${SHELL:-}")" = "fish" ] && LINE='set -gx PATH $HOME/.local/bin $PATH'
      mkdir -p "$(dirname "$PROFILE")"
      touch "$PROFILE"
      if grep -Fq "$LINE" "$PROFILE" 2>/dev/null; then
        say "✓ PATH: $BIN_DIR already in $PROFILE (open a new shell to pick it up)"
      else
        printf '\n# added by pinpoint installer\n%s\n' "$LINE" >> "$PROFILE"
        say "✓ PATH: added $BIN_DIR to $PROFILE — open a new shell, or run:  source $PROFILE"
      fi
    fi
    ;;
esac

say ""
say "done — Pinpoint is ready."
say "  CLI:          pinpoint annotate $REPO/test/fixture/index.html"
say "  Claude Code:  /pinpoint <file.html>"
