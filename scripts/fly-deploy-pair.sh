#!/usr/bin/env bash
# Deploy Voice if this checkout changed, then WoolGrown Command.
# Run from Voice or from Alpha (`scripts/fly-deploy.sh` wraps this).
set -euo pipefail

VOICE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMAND_ROOT="$(cd "$VOICE_ROOT/../alpha" && pwd)"
VOICE_APP="lindsay-voice"
COMMAND_APP="woolgrown-command"

if [[ ! -f "$VOICE_ROOT/fly.toml" ]]; then
  echo "Voice fly.toml missing at $VOICE_ROOT" >&2
  exit 1
fi

voice_sha() {
  git -C "$VOICE_ROOT" rev-parse HEAD
}

deployed_voice_sha() {
  flyctl ssh console -a "$VOICE_APP" -C "printenv FLY_VOICE_SHA" -s 2>/dev/null \
    | tr -d '\r' \
    | tail -n 1 \
    || true
}

voice_needs_deploy() {
  if [[ -n "$(git -C "$VOICE_ROOT" status --porcelain)" ]]; then
    return 0
  fi
  local live
  live="$(deployed_voice_sha)"
  if [[ -z "$live" || "$live" == "unknown" || "$live" != "$(voice_sha)" ]]; then
    return 0
  fi
  return 1
}

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

echo "Pair deploy done. Command should use VOICE_URL=https://$VOICE_APP.fly.dev"
