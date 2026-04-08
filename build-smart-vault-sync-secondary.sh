#!/bin/bash
# ==============================================================================
# Script: build-smart-vault-sync-secondary.sh
# Description: Build SECONDARY smart vault work only.
#              Focus: optional shared/global second-brain later.
#              Phases: S1-S4.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap-smart-vault-sync.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/vault-sync-secondary-$(date +%Y%m%d-%H%M%S).log"
PLAN_DIR="$PROJECT_ROOT/plans"

DRY_RUN=""
AUTO_MODE=""
SINGLE_PHASE=""
FROM_PHASE=""
BUDGET_PER_CALL="10.00"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ARGS=("$@")
for i in "${!ARGS[@]}"; do
    case "${ARGS[$i]}" in
        --dry-run)  DRY_RUN="true" ;;
        --auto)     AUTO_MODE="true" ;;
        --phase)    SINGLE_PHASE="${ARGS[$((i+1))]:-}" ;;
        --from)     FROM_PHASE="${ARGS[$((i+1))]:-}" ;;
        --budget)   BUDGET_PER_CALL="${ARGS[$((i+1))]:-10.00}" ;;
    esac
done

mkdir -p "$LOG_DIR" "$PLAN_DIR"

log() { echo -e "[$1] $2" | tee -a "$LOG_FILE"; }
info() { log "INFO" "${BLUE}$*${NC}"; }
success() { log "OK" "${GREEN}$*${NC}"; }
warn() { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }
header() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    log "PHASE" "${CYAN}$*${NC}"
    echo -e "${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
}

run_claude() {
    local prompt="$1" model="${2:-sonnet}" effort="${3:-medium}" budget="${4:-$BUDGET_PER_CALL}"
    local flags="--model $model --effort $effort --output-format text --max-budget-usd $budget"
    [[ "$AUTO_MODE" == "true" ]] && flags="$flags --dangerously-skip-permissions"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] claude -p \"${prompt:0:100}...\" --model $model --effort $effort --budget \$$budget"
        return 0
    fi

    info "Claude ($model, effort=$effort, budget=\$$budget): ${prompt:0:80}..."
    # shellcheck disable=SC2086
    claude -p "$prompt" $flags 2>&1 | tee -a "$LOG_FILE"
    local ec=${PIPESTATUS[0]}; [[ $ec -ne 0 ]] && warn "Exit code $ec"; return $ec
}

find_latest_plan() {
    find "$PLAN_DIR" -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}

run_plan() {
    local desc="$1" effort="${2:-high}"
    local roadmap; roadmap=$(cat "$ROADMAP")
    run_claude "/ck:plan --fast $desc

Reference roadmap:
$roadmap" "opus" "$effort" "$BUDGET_PER_CALL"
}

run_cook() {
    local pp; pp=$(find_latest_plan)
    if [[ -z "$pp" ]]; then
        warn "No plan.md — cooking from roadmap"
        local rm; rm=$(cat "$ROADMAP")
        run_claude "/ck:cook --auto Implement:

$rm" "sonnet" "medium" "$BUDGET_PER_CALL"
        return $?
    fi
    info "Cooking: $pp"
    run_claude "/ck:cook --auto $pp" "sonnet" "medium" "$BUDGET_PER_CALL"
}

run_test() { run_claude "/ck:test Run all tests." "sonnet" "low" "5.00"; }
run_ship() { run_claude "/ck:git cm Stage and commit." "sonnet" "low" "1.00"; }

confirm() {
    [[ "$AUTO_MODE" == "true" || "$DRY_RUN" == "true" ]] && return 0
    read -p "$(echo -e "${YELLOW}Proceed? [Y/n]${NC} ")" c
    [[ "${c:-Y}" =~ ^[Nn] ]] && { warn "Paused. Resume: $0 --from $1"; exit 0; }
}

s1() {
    header "S1: Promote Proven Project Notes To Global Brain"
    run_plan "Create src/commands/sync/smart-pull.ts for secondary/global mode only. Promote only proven reusable notes from project vaults into shared/global second-brain. Skip project-specific notes. Preserve provenance and dry-run behavior."
    confirm 2; run_cook; run_test; run_ship
    success "S1 complete"
}

s2() {
    header "S2: Optional Global Knowledge Push Into Project"
    run_plan "Create src/commands/sync/smart-push.ts for optional global/shared mode. Read shared lessons, patterns, decisions. Filter relevance to project context and inject only when useful. Keep project-inside notes as primary source."
    confirm 3; run_cook; run_test; run_ship
    success "S2 complete"
}

s3() {
    header "S3: Global Alignment Check"
    run_plan "Create src/commands/sync/alignment-checker.ts for shared/global mode. Compare project notes with global notes, detect drift, contradictions, outdated copies, and report recommended direction."
    confirm 4; run_cook; run_test; run_ship
    success "S3 complete"
}

s4() {
    header "S4: Shared Sync CLI"
    run_plan "Create src/commands/sync/sync-command.ts for optional global/shared sync. Commands: sync pull, sync push, sync check. Add dry-run and force fallback. Keep secondary/global scope clearly separate from primary mode."
    confirm 4; run_cook; run_test
    success "S4 complete — secondary smart vault work done"
}

main() {
    local start_time=$(date +%s)
    info "=========================================="
    info "Smart Vault Sync SECONDARY"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: S$SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: S$FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto"
    info "Budget per call: \$$BUDGET_PER_CALL"
    info "=========================================="

    cd "$PROJECT_ROOT"
    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            1) s1 ;;
            2) s2 ;;
            3) s3 ;;
            4) s4 ;;
            *) error "Unknown secondary phase (valid: 1-4)"; exit 1 ;;
        esac
        success "Secondary phase S$SINGLE_PHASE done in $(( $(date +%s) - start_time ))s"
        echo "Log: $LOG_FILE"
        return
    fi

    local start=1; [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"
    local phases=(s1 s2 s3 s4)
    local nums=(1 2 3 4)

    for i in "${!phases[@]}"; do
        [[ "${nums[$i]}" -ge "$start" ]] && ${phases[$i]} || info "Skipping secondary phase S${nums[$i]}"
    done

    echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
    success "SECONDARY SMART VAULT WORK COMPLETE in $(( $(date +%s) - start_time ))s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
