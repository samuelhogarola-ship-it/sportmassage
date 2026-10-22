#!/bin/sh
set -eu

umask 0027

app_root="${APP_ROOT:-/app}"
state_dir="${BLOGGER_STATE_DIR:-.blogger-state}"
content_dir="${BLOGGER_CONTENT_ROOT:-content/blog}"

case "${state_dir}" in /*) ;; *) state_dir="${app_root}/${state_dir}" ;; esac
case "${content_dir}" in /*) ;; *) content_dir="${app_root}/${content_dir}" ;; esac

mkdir -p "${content_dir}/media" "${state_dir}/public"
chmod 0750 "${content_dir}" "${content_dir}/media" "${state_dir}" "${state_dir}/public"

cd "${app_root}"
node scripts/bootstrap-static-release.mjs

if [ "${BLOGGER_BOOTSTRAP_ONLY:-false}" = "true" ]; then
  exit 0
fi

exec node scripts/post-manager-server.mjs
