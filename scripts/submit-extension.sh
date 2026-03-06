#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BW_SESSION:-}" ]; then
  echo "Bitwarden vault is locked. Unlocking..."
  BW_SESSION=$(bw unlock --raw)
  export BW_SESSION
fi

AMO_KEY=$(bw get item "Mozilla add-on API Credentials" --session "$BW_SESSION" |
  jq -r '.fields[] | select(.name == "api-key") | .value')
AMO_SECRET=$(bw get item "Mozilla add-on API Credentials" --session "$BW_SESSION" |
  jq -r '.fields[] | select(.name == "api-secret") | .value')

npx web-ext sign --channel=listed --api-key="$AMO_KEY" --api-secret="$AMO_SECRET" --source-dir=extension/
