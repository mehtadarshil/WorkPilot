#!/usr/bin/env bash
# scripts/deploy.sh — production deploy for WorkPilot (Item 6)
#
# Same shape as the valmont-security deploy.sh — see that file for the
# detailed contract. Key differences for WorkPilot:
#   - Repo root:     /home/ubuntu/WorkPilot
#   - PM2 app names: workpilot-backend / workpilot-frontend (not bare backend/frontend)
#   - Ports:         4000 (api) / 3001 (frontend)
#
# Usage:
#   ./scripts/deploy.sh                       # both
#   ./scripts/deploy.sh backend               # only WorkPilot API
#   ./scripts/deploy.sh frontend              # only WorkPilot frontend
#   ./scripts/deploy.sh --no-pull all         # skip git pull
#   ./scripts/deploy.sh --skip-build backend  # just pm2 reload
#   ./scripts/deploy.sh --rollback backend    # restore .previous, reload
#
# Logs: /home/ubuntu/deploy-logs/workpilot-YYYYMMDD-HHMMSS.log
# Lock: /tmp/workpilot-deploy.lock

set -euo pipefail

REPO_ROOT="/home/ubuntu/WorkPilot"
ECOSYSTEM="${REPO_ROOT}/ecosystem.config.cjs"

declare -A SUBDIR=(
  [backend]="backend"
  [frontend]="frontend"
)
declare -A BUILD_OUT=(
  [backend]="dist"
  [frontend]=".next"
)
declare -A PORT=(
  [backend]="4000"
  [frontend]="3001"
)
declare -A HEALTH=(
  [backend]="https://api.work-pilot.co/api/health"
  [frontend]="https://work-pilot.co/"
)
# PM2 app names use a workpilot- prefix; user-facing target name doesn't.
declare -A PM2_NAME=(
  [backend]="workpilot-backend"
  [frontend]="workpilot-frontend"
)

LOG_DIR="/home/ubuntu/deploy-logs"
LOCK_FILE="/tmp/workpilot-deploy.lock"
PROJECT_NAME="workpilot"

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_DIM=""; C_RESET=""
fi

log()   { printf "%s %s\n" "${C_DIM}[$(date +'%H:%M:%S')]${C_RESET}" "$*"; }
info()  { log "${C_BLUE}ℹ${C_RESET}  $*"; }
ok()    { log "${C_GREEN}✓${C_RESET}  $*"; }
warn()  { log "${C_YELLOW}!${C_RESET}  $*"; }
err()   { log "${C_RED}✗${C_RESET}  $*" >&2; }

usage() {
  sed -n '2,25p' "$0" | sed 's|^# \?||'
  exit 1
}

NO_PULL=0
SKIP_BUILD=0
ROLLBACK=0
TARGETS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull)    NO_PULL=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --rollback)   ROLLBACK=1; shift ;;
    -h|--help)    usage ;;
    backend|frontend) TARGETS+=("$1"); shift ;;
    all)          TARGETS=(backend frontend); shift ;;
    *) err "unknown argument: $1"; usage ;;
  esac
done
[[ ${#TARGETS[@]} -eq 0 ]] && TARGETS=(backend frontend)

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/${PROJECT_NAME}-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
info "Deploy log: ${LOG_FILE}"

# Best-effort cleanup of deploy logs older than 30 days. Never fails the deploy.
find "$LOG_DIR" -maxdepth 1 -type f -name "${PROJECT_NAME}-*.log" -mtime +30 -delete 2>/dev/null || true

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  err "Another deploy is in progress (lock: $LOCK_FILE)."
  exit 2
fi

export NVM_DIR="${HOME}/.nvm"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || true
command -v pm2 >/dev/null || { err "pm2 not on PATH"; exit 2; }

cd "$REPO_ROOT"
CURRENT_HEAD=$(git rev-parse --short HEAD)
info "Repo HEAD before: ${CURRENT_HEAD} ($(git log -1 --pretty=%s | head -c 60))"

if [[ $ROLLBACK -eq 1 ]]; then
  info "--rollback: skipping git pull (restoring previous artefact, not pulling new code)."
elif [[ $NO_PULL -eq 0 ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    err "Working tree is dirty. Refusing to git pull."
    err "Either commit/stash, or re-run with --no-pull."
    git status -sb | head -n 20
    exit 2
  fi
  info "git pull --ff-only origin $(git rev-parse --abbrev-ref HEAD)"
  git pull --ff-only
  NEW_HEAD=$(git rev-parse --short HEAD)
  if [[ "$CURRENT_HEAD" != "$NEW_HEAD" ]]; then
    info "Pulled to ${NEW_HEAD} ($(git log -1 --pretty=%s | head -c 60))"
  else
    info "Already up to date."
  fi
else
  warn "--no-pull: skipping git pull. Building current working tree."
fi

healthcheck() {
  local url="$1" i code
  for i in 1 2 3; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 "$url" || echo "000")
    if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
      ok "Healthcheck ${url} → HTTP ${code}"
      return 0
    fi
    warn "Healthcheck ${url} → HTTP ${code} (attempt ${i}/3)"
    sleep $((i * 2))
  done
  return 1
}

deploy_one() {
  local target="$1"
  local subdir="${SUBDIR[$target]}"
  local build_out="${BUILD_OUT[$target]}"
  local port="${PORT[$target]}"
  local health_url="${HEALTH[$target]}"
  local pm2_name="${PM2_NAME[$target]}"
  local app_dir="${REPO_ROOT}/${subdir}"
  local build_path="${app_dir}/${build_out}"
  local backup_path="${build_path}.previous"

  echo
  info "${C_BLUE}═══ ${pm2_name} (${subdir}, port ${port}) ═══${C_RESET}"

  cd "$app_dir"

  if [[ $ROLLBACK -eq 1 ]]; then
    if [[ ! -d "$backup_path" ]]; then
      err "No ${backup_path} to roll back to."
      return 4
    fi
    warn "Rollback requested — swapping ${build_out} ↔ ${build_out}.previous"
    rm -rf "${build_path}.rollback-tmp"
    mv "$build_path" "${build_path}.rollback-tmp"
    mv "$backup_path" "$build_path"
    mv "${build_path}.rollback-tmp" "$backup_path"
    pm2 reload "$pm2_name" --update-env
    sleep 5
    healthcheck "$health_url" || { err "Healthcheck still failing after rollback."; return 4; }
    ok "Rolled back ${pm2_name}."
    return 0
  fi

  if [[ $SKIP_BUILD -eq 0 ]]; then
    info "npm ci (this may take 30-90s)…"
    npm ci --no-audit --no-fund

    info "Backing up current ${build_out} → ${build_out}.previous"
    rm -rf "$backup_path"
    [[ -d "$build_path" ]] && cp -a "$build_path" "$backup_path"

    info "npm run build"
    if ! npm run build; then
      err "Build failed. Restoring previous ${build_out}."
      rm -rf "$build_path"
      [[ -d "$backup_path" ]] && mv "$backup_path" "$build_path"
      return 3
    fi

    if [[ "$target" == "backend" && ! -f "${build_path}/index.js" ]]; then
      err "Build succeeded but ${build_path}/index.js is missing. Restoring."
      rm -rf "$build_path"
      [[ -d "$backup_path" ]] && mv "$backup_path" "$build_path"
      return 3
    fi
    ok "Build artefact ready."
  else
    warn "--skip-build: not running npm ci/build."
  fi

  local pm2_pid
  pm2_pid=$(pm2 jlist 2>/dev/null \
    | python3 -c "import json,sys; data=json.load(sys.stdin); print(next((p['pid'] for p in data if p['name']=='${pm2_name}'), 0))")
  local port_pid
  port_pid=$(sudo ss -tlnp "sport = :${port}" 2>/dev/null | tail -n +2 | grep -oP 'pid=\K[0-9]+' | head -n 1 || true)
  if [[ -n "${port_pid:-}" && "${port_pid}" != "${pm2_pid}" && "${pm2_pid}" -ne 0 ]]; then
    warn "Orphan process on port ${port}: pid=${port_pid} (PM2 thinks it's pid=${pm2_pid})"
    warn "Killing orphan ${port_pid} so PM2 can rebind cleanly."
    sudo kill -9 "$port_pid" || true
    sleep 1
  fi

  info "pm2 startOrReload ${ECOSYSTEM} --only ${pm2_name} --update-env"
  pm2 startOrReload "$ECOSYSTEM" --only "$pm2_name" --update-env

  info "Waiting up to 20s for port ${port} to bind…"
  local i
  for i in $(seq 1 20); do
    if sudo ss -tln "sport = :${port}" 2>/dev/null | tail -n +2 | grep -q LISTEN; then
      ok "Port ${port} listening after ${i}s."
      break
    fi
    sleep 1
    if [[ $i -eq 20 ]]; then
      err "Port ${port} never bound. Rolling back."
      rm -rf "$build_path"
      [[ -d "$backup_path" ]] && mv "$backup_path" "$build_path"
      pm2 reload "$pm2_name" --update-env || true
      return 4
    fi
  done

  if ! healthcheck "$health_url"; then
    err "Healthcheck failed after deploy. Rolling back."
    rm -rf "$build_path"
    [[ -d "$backup_path" ]] && mv "$backup_path" "$build_path"
    pm2 reload "$pm2_name" --update-env || true
    sleep 5
    healthcheck "$health_url" \
      && warn "Service recovered after rollback." \
      || err "Service still unhealthy after rollback. Manual intervention required."
    return 4
  fi

  ok "${pm2_name} healthy."
}

OVERALL_START=$(date +%s)
declare -A RESULTS

for target in "${TARGETS[@]}"; do
  if deploy_one "$target"; then
    RESULTS[$target]="ok"
  else
    RESULTS[$target]="FAIL"
  fi
done

ALL_OK=1
for target in "${TARGETS[@]}"; do
  [[ "${RESULTS[$target]}" != "ok" ]] && ALL_OK=0
done

if [[ $ALL_OK -eq 1 ]]; then
  info "pm2 save"
  pm2 save >/dev/null
fi

echo
DUR=$(( $(date +%s) - OVERALL_START ))
info "${C_BLUE}═══ Summary (${DUR}s) ═══${C_RESET}"
for target in "${TARGETS[@]}"; do
  if [[ "${RESULTS[$target]}" == "ok" ]]; then
    ok "${PM2_NAME[$target]}"
  else
    err "${PM2_NAME[$target]}"
  fi
done

[[ $ALL_OK -eq 1 ]] || exit 4
ok "Deploy complete."
