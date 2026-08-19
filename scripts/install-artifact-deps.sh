#!/bin/bash
# Install dependencies for every artifact under artifacts/*.
#
# Artifacts are pnpm projects while the root app is an npm project. Running
# pnpm from the repo root (even with --filter) makes pnpm take ownership of the
# root node_modules and relink the npm-installed packages, which breaks the
# main app. Each artifact is therefore installed in isolation with
# --ignore-workspace so pnpm only ever touches the artifact's own directory.
#
# Deployment builds only run `npm install` at the root, so this script is what
# gets artifact dependencies onto disk before the platform builds each artifact.
set -euo pipefail

cd "$(dirname "$0")/.."

shopt -s nullglob
manifests=(artifacts/*/package.json)

if [ ${#manifests[@]} -eq 0 ]; then
  echo "no artifacts to install"
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to install artifact dependencies but was not found on PATH" >&2
  exit 1
fi

for manifest in "${manifests[@]}"; do
  dir="$(dirname "$manifest")"
  echo "installing dependencies for $dir..."
  # --prod=false: artifact build tooling lives in devDependencies and must be
  # installed even when NODE_ENV=production during a deployment build.
  # --no-frozen-lockfile: a lockfile that has drifted from package.json should
  # resolve rather than abort the publish; pnpm still reuses the lockfile when
  # it is in sync.
  (cd "$dir" && pnpm install --ignore-workspace --prod=false --no-frozen-lockfile)
done
