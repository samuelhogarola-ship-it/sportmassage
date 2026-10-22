#!/usr/bin/env bash
set -euo pipefail

umask 0027

app_root="${APP_ROOT:-/app}"
state_dir="${BLOGGER_STATE_DIR:-.blogger-state}"
content_dir="${BLOGGER_CONTENT_ROOT:-content/blog}"

if [[ "${state_dir}" != /* ]]; then state_dir="${app_root}/${state_dir}"; fi
if [[ "${content_dir}" != /* ]]; then content_dir="${app_root}/${content_dir}"; fi

mkdir -p "${content_dir}/media" "${state_dir}"
chmod 0750 "${content_dir}" "${content_dir}/media" "${state_dir}"

cd "${app_root}"
node scripts/bootstrap-static-release.mjs

export NGINX_LISTEN="${NGINX_LISTEN:-8080}"
export PUBLIC_ROOT="${PUBLIC_ROOT:-${state_dir}/public/current}"
export BLOGGER_UPSTREAM="${BLOGGER_UPSTREAM:-127.0.0.1:${PORT:-8787}}"
export NGINX_PID="${NGINX_PID:-${state_dir}/nginx.pid}"
nginx_config="${NGINX_CONFIG:-${state_dir}/nginx.conf}"

envsubst '${NGINX_LISTEN} ${PUBLIC_ROOT} ${BLOGGER_UPSTREAM} ${NGINX_PID}' \
  < deploy/nginx-coolify.conf.template > "${nginx_config}"

if [[ "${BLOGGER_BOOTSTRAP_ONLY:-false}" == "true" ]]; then
  exit 0
fi

node scripts/post-manager-server.mjs &
node_pid=$!
nginx -c "${nginx_config}" -g 'daemon off;' &
nginx_pid=$!

shutdown() {
  trap - EXIT INT TERM
  kill -TERM "${node_pid}" "${nginx_pid}" 2>/dev/null || true
  wait "${node_pid}" "${nginx_pid}" 2>/dev/null || true
}

trap shutdown EXIT INT TERM
set +e
wait -n "${node_pid}" "${nginx_pid}"
status=$?
set -e
shutdown
exit "${status}"
