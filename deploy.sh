#!/usr/bin/env bash
set -euo pipefail

# One-command production deployment entrypoint.
cd "$(dirname "$0")"
./deploy/deploy-prod.sh
