#!/usr/bin/env bash
# Deploy Voice if this checkout changed, then WoolGrown Command.
# Run from Voice or from Alpha (`scripts/fly-deploy.sh` wraps this).
# Refuses dirty or unpushed trees — Fly uploads this folder, so it must
# already match the pushed SHA.
set -euo pipefail

VOICE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMAND_ROOT="$(cd "$VOICE_ROOT/../alpha" && pwd)"
VOICE_APP="lindsay-voice"
COMMAND_APP="woolgrown-command"

if [[ ! -f "$VOICE_ROOT/fly.toml" ]]; then
  echo "Voice fly.toml missing at $VOICE_ROOT" >&2
  exit 1
fi

require_clean_pushed() {
  local root="$1"
  local label="$2"
  if ! git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Refuse: $label is not a git checkout ($root)." >&2
    exit 1
  fi
  if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
    echo "Refuse: $label has uncommitted files. Commit and push, then deploy." >&2
    exit 1
  fi
  if ! git -C "$root" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    echo "Refuse: $label has no upstream. Push the branch first." >&2
    exit 1
  fi
  local head remote
  head="$(git -C "$root" rev-parse HEAD)"
  remote="$(git -C "$root" rev-parse '@{u}')"
  if [[ "$head" != "$remote" ]]; then
    echo "Refuse: $label HEAD is not the pushed tip." >&2
    exit 1
  fi
}

voice_sha() {
  git -C "$VOICE_ROOT" rev-parse HEAD
}

deployed_voice_sha() {
  flyctl ssh console -a "$VOICE_APP" -C "printenv FLY_VOICE_SHA" 2>/dev/null \
    | tr -d '\r' \
    | tail -n 1 \
    || true
}

voice_needs_deploy() {
  local live
  live="$(deployed_voice_sha)"
  if [[ -z "$live" || "$live" == "unknown" || "$live" != "$(voice_sha)" ]]; then
    return 0
  fi
  return 1
}

require_clean_pushed "$VOICE_ROOT" "Voice"
if [[ -f "$COMMAND_ROOT/fly.toml" ]]; then
  require_clean_pushed "$COMMAND_ROOT" "Command"
fi

# One tiny request per model, through Voice's real request code. A retired
# model or a changed request rule stops the deploy here, not in the app.
# Run a command on the repo's .nvmrc Node (20); tsx's native build needs it.
with_repo_node() {
  local dir="$1"; shift
  (
    cd "$dir"
    if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
      # shellcheck disable=SC1091
      source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
      nvm use --silent >/dev/null
    fi
    "$@"
  )
}

check_models() {
  local models=()
  if [[ -f "$COMMAND_ROOT/web/scripts/print-voice-models.ts" ]]; then
    local list
    if ! list="$(with_repo_node "$COMMAND_ROOT/web" npx tsx --tsconfig tsconfig.json scripts/print-voice-models.ts)"; then
      echo "Refuse: could not list Command's Voice models." >&2
      exit 1
    fi
    while IFS= read -r line; do [[ -n "$line" ]] && models+=("$line"); done <<< "$list"
  fi
  echo "Checking models: Voice default ${models[*]:-}"
  if ! with_repo_node "$VOICE_ROOT" npx tsx scripts/check-models.mts "${models[@]}"; then
    echo "Refuse: a model failed the check. Nothing was deployed." >&2
    exit 1
  fi
}
check_models

echo "Voice checkout: $VOICE_ROOT ($(voice_sha))"

if voice_needs_deploy; then
  echo "Deploying $VOICE_APP"
  (
    cd "$VOICE_ROOT"
    flyctl deploy --remote-only --build-arg "FLY_VOICE_SHA=$(voice_sha)"
  )
else
  echo "Voice $(voice_sha) already live — skip"
fi

if [[ ! -f "$COMMAND_ROOT/fly.toml" ]]; then
  echo "Command repo not at $COMMAND_ROOT — Voice only. Done."
  exit 0
fi

echo "Deploying $COMMAND_APP"
(
  cd "$COMMAND_ROOT"
  flyctl deploy --remote-only
)

echo "Pair deploy done. Command should use VOICE_URL=http://$VOICE_APP.internal:3030"
