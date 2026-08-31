#!/usr/bin/env bash
#
# TC deployment script.
#
# Orchestrates the path from a feature branch to a live cloud deployment:
#   1. check  — local verification only (typecheck, lint, test, build)
#   2. pr     — push the current branch and open a PR into main (never merges)
#   3. dev    — run dev DB migrations + deploy the API to Fly.io (tc-api-dev)
#   4. prod   — run production DB migrations + deploy the API to Fly.io (tc-api)
#   5. all    — check -> pr -> dev (never touches prod)
#
# Web (Vercel) auto-deploys on every push to main — this script does not
# (and cannot) drive that directly. Merging the PR opened by `pr` is what
# triggers it, and merging is a deliberate manual step: this script never
# merges a PR for you.
#
# Usage:
#   ./scripts/deploy.sh <command> [--dry-run] [--yes]
#
# Flags:
#   --dry-run   Print every side-effecting command instead of running it.
#   --yes       Skip the "does this look right" confirmation before `pr`,
#               `dev`, and the branch check in `prod`. The production
#               type-to-confirm safety gate is never skipped by this flag.
#
# Examples:
#   ./scripts/deploy.sh check
#   ./scripts/deploy.sh pr
#   ./scripts/deploy.sh dev --dry-run
#   ./scripts/deploy.sh all
#   ./scripts/deploy.sh prod          # must be run from main, always asks for typed confirmation
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=false
ASSUME_YES=false
COMMAND=""

# ── Arg parsing ────────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --yes) ASSUME_YES=true ;;
    check|pr|dev|prod|all) COMMAND="$arg" ;;
    -h|--help) COMMAND="help" ;;
    *)
      echo "Unknown argument: $arg" >&2
      COMMAND="help"
      ;;
  esac
done

# ── Small helpers ────────────────────────────────────────────────────────────

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Runs a side-effecting command, or just prints it under --dry-run.
run() {
  if $DRY_RUN; then
    printf '  [dry-run] %s\n' "$*"
  else
    printf '  $ %s\n' "$*"
    "$@"
  fi
}

confirm() {
  local prompt="$1"
  if $ASSUME_YES || $DRY_RUN; then
    return 0
  fi
  read -r -p "$prompt [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) die "Aborted." ;;
  esac
}

require_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    git status --short
    die "Working tree has uncommitted changes — commit or stash before continuing."
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not found on PATH."
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

# ── Steps ────────────────────────────────────────────────────────────────────

step_check() {
  log "Verifying: typecheck, lint, test, build (turbo, whole monorepo)"
  require_command pnpm
  run pnpm exec turbo run typecheck
  run pnpm exec turbo run lint
  run pnpm exec turbo run test
  run pnpm exec turbo run build
  log "All checks passed."
}

step_pr() {
  require_command gh
  require_clean_worktree

  local branch
  branch="$(current_branch)"
  [[ "$branch" == "main" ]] && die "Already on main — nothing to open a PR for."

  log "Pushing '$branch' and opening a PR into main"
  confirm "Push '$branch' to origin and open a PR into main?"

  run git push -u origin "$branch"
  run gh pr create --base main --head "$branch" --fill

  log "PR opened. Review it on GitHub and merge it yourself when ready —"
  log "this script deliberately never merges a PR for you. Merging to main"
  log "is what triggers Vercel's auto-deploy of the web app."
}

step_dev() {
  require_command fly
  require_clean_worktree

  local branch
  branch="$(current_branch)"
  if [[ "$branch" != "main" ]]; then
    warn "Deploying dev from branch '$branch', not main. This is fine for" \
         "testing a branch ahead of merge, but the dev API will run this" \
         "branch's code, not what's on GitHub's main."
  fi

  log "Running dev DB migrations (Neon dev, via APP_ENV=dev)"
  confirm "Run dev migrations and deploy tc-api-dev now?"
  run pnpm --filter @tc/api migration:run:dev

  log "Deploying API to Fly.io (tc-api-dev)"
  run fly deploy --config fly.dev.toml

  log "Dev deploy complete: https://tc-api-dev.fly.dev"
  log "Web preview deploys are handled by Vercel automatically per-branch/PR."
}

step_prod() {
  require_command fly
  require_clean_worktree

  local branch
  branch="$(current_branch)"
  if [[ "$branch" != "main" ]]; then
    die "Refusing to deploy production from branch '$branch' — checkout main first. Production only ever deploys from main."
  fi

  log "This will run PRODUCTION database migrations and deploy the LIVE API (tc-api)."
  read -r -p "Type the Fly app name (tc-api) to confirm: " typed
  [[ "$typed" == "tc-api" ]] || die "Confirmation did not match — aborting."

  log "Building API (dist/ is required by the production migration runner)"
  run pnpm --filter @tc/api build

  log "Running PRODUCTION DB migrations"
  run pnpm --filter @tc/api migration:run:prod

  log "Deploying API to Fly.io (tc-api, production)"
  run fly deploy --config fly.toml

  log "Production deploy complete: https://tc-api.fly.dev"
  log "Web production deploy already happened via Vercel when main was updated."
}

step_all() {
  step_check
  step_pr
  step_dev
  log "Note: 'all' never runs 'prod' — run './scripts/deploy.sh prod' explicitly, from main, when you're ready."
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh <command> [--dry-run] [--yes]

Commands:
  check   Run typecheck/lint/test/build across the monorepo. No git or network changes.
  pr      Push the current branch and open a PR into main. Never merges.
  dev     Run dev DB migrations and deploy the API to tc-api-dev (Fly.io).
  prod    Run production DB migrations and deploy the API to tc-api (Fly.io).
          Must be run from main. Always requires typing the app name to confirm.
  all     check -> pr -> dev. Never touches prod.

Flags:
  --dry-run   Print commands instead of running them.
  --yes       Skip the confirmation prompts for pr/dev (prod's type-to-confirm
              gate is never skipped).

Examples:
  ./scripts/deploy.sh check
  ./scripts/deploy.sh pr
  ./scripts/deploy.sh dev --dry-run
  ./scripts/deploy.sh all
  ./scripts/deploy.sh prod
EOF
}

# ── Entry point ──────────────────────────────────────────────────────────────

case "$COMMAND" in
  check) step_check ;;
  pr)    step_pr ;;
  dev)   step_dev ;;
  prod)  step_prod ;;
  all)   step_all ;;
  help|"") usage ;;
  *) usage; exit 1 ;;
esac
