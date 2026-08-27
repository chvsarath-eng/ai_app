#!/usr/bin/env bash
set -euo pipefail

SERVICE_KEY="${1:?Usage: deploy-cloud-run.sh <web|api> <image>}"
IMAGE="${2:?Usage: deploy-cloud-run.sh <web|api> <image>}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT_DIR}/deploy/config/${SERVICE_KEY}.json"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Missing config: ${CONFIG_FILE}" >&2
  exit 1
fi

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set GCP_PROJECT_ID or gcloud project" >&2
  exit 1
fi

read_config() {
  python3 - "$CONFIG_FILE" "$1" <<'PY'
import json, sys
config = json.load(open(sys.argv[1], encoding="utf-8"))
print(config[sys.argv[2]])
PY
}

SERVICE_NAME="$(read_config serviceName)"
REGION="$(read_config region)"
PORT="$(read_config port)"
CPU="$(read_config cpu)"
MEMORY="$(read_config memory)"
MIN_INSTANCES="$(read_config minInstances)"
MAX_INSTANCES="$(read_config maxInstances)"
CONCURRENCY="$(read_config concurrency)"
TIMEOUT="$(read_config timeout)"
ALLOW_UNAUTH="$(read_config allowUnauthenticated)"
CPU_ALWAYS="$(python3 - "$CONFIG_FILE" <<'PY'
import json, sys
config = json.load(open(sys.argv[1], encoding="utf-8"))
print("true" if config.get("cpuAlwaysAllocated") else "false")
PY
)"

ENV_VARS="$(python3 - "$CONFIG_FILE" <<'PY'
import json, sys
config = json.load(open(sys.argv[1], encoding="utf-8"))
pairs = [f"{k}={v}" for k, v in config.get("env", {}).items()]
print(",".join(pairs))
PY
)"

SECRET_ARGS=()
while IFS= read -r line; do
  [[ -n "${line}" ]] && SECRET_ARGS+=(--set-secrets "${line}")
done < <(python3 - "$CONFIG_FILE" <<'PY'
import json, sys
config = json.load(open(sys.argv[1], encoding="utf-8"))
for key, ref in config.get("secrets", {}).items():
    print(f"{key}={ref}")
PY
)

DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --image "${IMAGE}"
  --region "${REGION}"
  --project "${PROJECT_ID}"
  --platform managed
  --port "${PORT}"
  --cpu "${CPU}"
  --memory "${MEMORY}"
  --min-instances "${MIN_INSTANCES}"
  --max-instances "${MAX_INSTANCES}"
  --concurrency "${CONCURRENCY}"
  --timeout "${TIMEOUT}"
)

if [[ "${ALLOW_UNAUTH}" == "True" || "${ALLOW_UNAUTH}" == "true" ]]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

if [[ "${CPU_ALWAYS}" == "true" ]]; then
  DEPLOY_ARGS+=(--cpu-boost --no-cpu-throttling)
fi

if [[ -n "${ENV_VARS}" ]]; then
  DEPLOY_ARGS+=(--set-env-vars "${ENV_VARS}")
fi

if [[ ${#SECRET_ARGS[@]} -gt 0 ]]; then
  DEPLOY_ARGS+=("${SECRET_ARGS[@]}")
fi

echo "Deploying ${SERVICE_NAME} -> ${IMAGE}"
gcloud "${DEPLOY_ARGS[@]}"
