#!/usr/bin/env bash
#
# fix-claude.sh — Repair a broken @anthropic-ai/claude-code global install.
#
# WHY THIS SCRIPT EXISTS
#   The claude-code npm package ships a JavaScript stub at bin/claude.exe
#   (yes, .exe on every platform — Anthropic uses one path so the npm `bin`
#   pointer is cross-platform). The package's postinstall is supposed to copy
#   the platform-native binary (Linux ELF / macOS Mach-O / Windows PE) from
#   node_modules/@anthropic-ai/claude-code-<plat>-<arch>/claude on top of that
#   stub. If postinstall didn't run — common with pnpm 11+, npm install
#   --ignore-scripts, npm install --omit=optional, or a flaky first install —
#   `claude` exits with "claude native binary not installed."
#
#   This script:
#     1. Locates the global package
#     2. Confirms the stub is the JS wrapper (ASCII), not the native binary
#     3. Deletes the stub so the install can't silently no-op
#     4. Re-runs the package's own install.cjs
#     5. Verifies the result is an ELF/Mach-O/PE executable
#
# USAGE
#   ./scripts/fix-claude.sh          # idempotent; safe to re-run
#
# Exits non-zero if Claude can't be located or repair fails.

set -euo pipefail

step() { printf '\n→ %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die()  { printf '  ✗ %s\n' "$*" >&2; exit 1; }

step "Locating global npm root"
if ! NPM_ROOT="$(npm root -g 2>/dev/null)"; then
  die "Could not run 'npm root -g'. Is npm installed and on PATH?"
fi
ok "npm root -g = $NPM_ROOT"

CLAUDE_PKG="$NPM_ROOT/@anthropic-ai/claude-code"
STUB="$CLAUDE_PKG/bin/claude.exe"
INSTALLER="$CLAUDE_PKG/install.cjs"

step "Checking for the Claude package"
if [ ! -d "$CLAUDE_PKG" ]; then
  die "Package not found at $CLAUDE_PKG. Install with: npm install -g @anthropic-ai/claude-code"
fi
ok "Found $CLAUDE_PKG"

if [ ! -f "$INSTALLER" ]; then
  die "install.cjs missing at $INSTALLER — the package may be corrupt; reinstall."
fi

step "Inspecting current state of bin/claude.exe"
if [ ! -f "$STUB" ]; then
  warn "bin/claude.exe missing (will be re-created by install.cjs)"
  CURRENT_KIND="missing"
else
  CURRENT_KIND="$(file -b "$STUB" 2>/dev/null || echo "unknown")"
  ok "current: $CURRENT_KIND"
  case "$CURRENT_KIND" in
    ELF*|Mach-O*|PE32*)
      ok "Already a native binary — nothing to repair. Exiting."
      exit 0
      ;;
    *)
      warn "Looks like the JS stub or an unknown file — proceeding with repair."
      ;;
  esac
fi

step "Removing stub so install.cjs can't silently no-op"
rm -f "$STUB"
ok "Deleted $STUB (if it existed)"

step "Running the package's postinstall (node install.cjs)"
if ! node "$INSTALLER"; then
  die "install.cjs exited non-zero. Check the output above; you may need to reinstall the package without --omit=optional / --ignore-scripts."
fi
ok "install.cjs completed"

step "Verifying repair"
if [ ! -f "$STUB" ]; then
  die "bin/claude.exe was not created. install.cjs ran but produced nothing — try a full reinstall: npm install -g @anthropic-ai/claude-code"
fi

NEW_KIND="$(file -b "$STUB" 2>/dev/null || echo "unknown")"
case "$NEW_KIND" in
  ELF*|Mach-O*|PE32*)
    ok "bin/claude.exe is now: $NEW_KIND"
    ;;
  *)
    die "bin/claude.exe is still not a native binary (got: $NEW_KIND). Try reinstalling the package."
    ;;
esac

step "Sanity-checking the CLI"
if command -v claude >/dev/null 2>&1; then
  if VERSION="$(claude --version 2>&1 | head -1)"; then
    ok "claude --version → $VERSION"
  else
    warn "claude --version failed despite a native binary on disk — check PATH conflicts."
  fi
else
  warn "'claude' is not on PATH. The binary is fixed but you'll need to add $(dirname "$(which npm)") or the npm global bin dir to PATH."
fi

printf '\nDone. Claude is ready.\n'
