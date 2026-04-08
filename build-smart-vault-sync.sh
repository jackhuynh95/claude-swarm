#!/bin/bash
# ==============================================================================
# Script: build-smart-vault-sync.sh
# Description: Compatibility wrapper. Primary and secondary smart vault work now
#              live in separate scripts.
#
# Usage:
#   ./build-smart-vault-sync.sh primary --auto
#   ./build-smart-vault-sync.sh secondary --auto
#   ./build-smart-vault-sync.sh all --auto
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-all}"

case "$MODE" in
    primary)
        exec "$SCRIPT_DIR/build-smart-vault-sync-primary.sh" "${@:2}"
        ;;
    secondary)
        exec "$SCRIPT_DIR/build-smart-vault-sync-secondary.sh" "${@:2}"
        ;;
    all)
        "$SCRIPT_DIR/build-smart-vault-sync-primary.sh" "${@:2}"
        "$SCRIPT_DIR/build-smart-vault-sync-secondary.sh" "${@:2}"
        ;;
    *)
        echo "Usage: $0 [primary|secondary|all] [args...]"
        exit 1
        ;;
esac
