#!/bin/bash
set -e

npm install --legacy-peer-deps
bash "$(dirname "$0")/install-artifact-deps.sh"
npx drizzle-kit push --force
