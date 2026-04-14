#!/bin/bash
# ==============================================================================
# Script: build-grill-me-debrief-builder.sh
# Description: Build builder/manual workflow upgrades for the grill-me + debrief
#              roadmap first. New-topic flow only. Keep existing guides intact.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap-grill-me-debrief.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/grill-me-builder-$(date +%Y%m%d-%H%M%S).log"
PLAN_DIR="$PROJECT_ROOT/plans"

DRY_RUN=""
AUTO_MODE=""
SINGLE_PHASE=""
FROM_PHASE=""
BUDGET_PER_CALL="8.00"
MAX_RETRIES=3
RETRY_DELAY_SECONDS=5
CURRENT_PLAN_PATH=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ARGS=("$@")
for i in "${!ARGS[@]}"; do
    case "${ARGS[$i]}" in
        --dry-run) DRY_RUN="true" ;;
        --auto) AUTO_MODE="true" ;;
        --phase) SINGLE_PHASE="${ARGS[$((i+1))]:-}" ;;
        --from) FROM_PHASE="${ARGS[$((i+1))]:-}" ;;
        --budget) BUDGET_PER_CALL="${ARGS[$((i+1))]:-8.00}" ;;
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
    local attempt=1
    [[ "$AUTO_MODE" == "true" ]] && flags="$flags --dangerously-skip-permissions"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] claude -p \"${prompt:0:100}...\" --model $model --effort $effort --budget \$$budget"
        return 0
    fi

    while [[ $attempt -le $MAX_RETRIES ]]; do
        local attempt_log
        attempt_log=$(mktemp)
        info "Claude ($model, effort=$effort, budget=\$$budget, attempt=$attempt/$MAX_RETRIES): ${prompt:0:80}..."
        # shellcheck disable=SC2086
        claude -p "$prompt" $flags 2>&1 | tee -a "$LOG_FILE" "$attempt_log"
        local ec=${PIPESTATUS[0]}

        if [[ $ec -eq 0 ]]; then
            rm -f "$attempt_log"
            return 0
        fi

        if grep -q 'API Error: 529' "$attempt_log"; then
            rm -f "$attempt_log"
            warn "Claude overloaded (529). Retrying in ${RETRY_DELAY_SECONDS}s..."
            sleep "$RETRY_DELAY_SECONDS"
            ((attempt++))
            continue
        fi

        rm -f "$attempt_log"
        warn "Exit code $ec"
        return $ec
    done

    warn "Claude failed after $MAX_RETRIES attempts"
    return 1
}

find_latest_plan() {
    find "$PLAN_DIR" -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}

find_recent_plan() {
    local since="$1"
    find "$PLAN_DIR" -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null \
        | awk -v since="$since" '$1 >= since { $1=""; sub(/^ /, ""); print }' \
        | tail -1
}

run_plan() {
    local desc="$1" effort="${2:-medium}"
    local roadmap; roadmap=$(cat "$ROADMAP")
    local started_at; started_at=$(date +%s)
    run_claude "/ck:plan --fast $desc

Reference roadmap:
$roadmap" "sonnet" "$effort" "$BUDGET_PER_CALL"
    CURRENT_PLAN_PATH="$(find_recent_plan "$started_at")"
    if [[ -z "$CURRENT_PLAN_PATH" ]]; then
        error "No new plan.md detected from current /ck:plan run"
        return 1
    fi
    info "Planned: $CURRENT_PLAN_PATH"
}

run_cook() {
    local plan_path="${CURRENT_PLAN_PATH:-}"
    if [[ -z "$plan_path" ]]; then
        warn "No current plan.md selected"
        return 1
    fi
    info "Cooking: $plan_path"
    run_claude "/ck:cook --auto $plan_path" "sonnet" "medium" "$BUDGET_PER_CALL"
}

run_test() { run_claude "/ck:test Run relevant tests for the recent changes." "sonnet" "low" "5.00"; }
run_ship() { run_claude "/ck:git cm Stage and commit." "sonnet" "low" "1.00" || warn "Commit skipped or failed"; }

confirm() {
    [[ "$AUTO_MODE" == "true" || "$DRY_RUN" == "true" ]] && return 0
    read -p "$(echo -e "${YELLOW}Proceed? [Y/n]${NC} ")" c
    [[ "${c:-Y}" =~ ^[Nn] ]] && { warn "Paused. Resume: $0 --from $1"; exit 0; }
}

b1() {
    header "B1: Grill-Me Command + Skill"
    run_plan "Add public command claude-swarm grill-me <topic> backed by a repo-local grill-me skill. Write plans/<plan-dir>/spec.md for new topics. Keep old guides and in-progress topics unchanged."
    confirm 2; run_cook; run_test; run_ship; success "B1 complete"
}

b2() {
    header "B2: Spec Artifact + New Topic Storage Rule"
    run_plan "Implement spec artifact writer for new topics. plans/ is execution truth. obsidian-vault/ is memory and reuse. Mirror summaries, lessons, debrief notes, and follow-up clues into obsidian-vault/ after execution."
    confirm 3; run_cook; run_test; run_ship; success "B2 complete"
}

b3() {
    header "B3: Builder Integration"
    run_plan "Replace ck:brainstorm with grill-me as the default pre-plan step for new builder/manual topics only. Update roadmap-generator.ts, generate-doc.ts, and from-scratch-pipeline.ts. If grill-me already resolved scope, file list, and checklist, prefer ck:plan --fast on sonnet."
    confirm 4; run_cook; run_test; run_ship; success "B3 complete"
}

b4() {
    header "B4: Debrief Skill + Builder Wiring"
    run_plan "Add debrief skill/template and wire builder execution in src/commands/build/epic-executor.ts. After implementation, compare spec.md, plan.md, and cook result, then write a debrief trace and follow-up clues."
    confirm 5; run_cook; run_test; run_ship; success "B4 complete"
}

b5() {
    header "B5: Docs + Compatibility Policy"
    run_plan "Update README, cli-usage-guide, and roadmap docs for the new-topic builder workflow. Keep existing generated guides compatible. Do not rewrite old topic instructions automatically."
    confirm 5; run_cook; run_test; run_ship; success "B5 complete — builder workflow ready first"
}

main() {
    local start_time; start_time=$(date +%s)
    info "=========================================="
    info "Grill-Me + Debrief BUILDER"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: B$SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: B$FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto"
    info "Budget per call: \$$BUDGET_PER_CALL"
    info "=========================================="

    cd "$PROJECT_ROOT"
    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            1) b1 ;;
            2) b2 ;;
            3) b3 ;;
            4) b4 ;;
            5) b5 ;;
            *) error "Unknown builder phase (valid: 1-5)"; exit 1 ;;
        esac
        success "Builder phase B$SINGLE_PHASE done in $(( $(date +%s) - start_time ))s"
        echo "Log: $LOG_FILE"
        return
    fi

    local start=1; [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"
    local phases=(b1 b2 b3 b4 b5)
    local nums=(1 2 3 4 5)
    for i in "${!phases[@]}"; do
        if [[ "${nums[$i]}" -ge "$start" ]]; then ${phases[$i]}; else info "Skipping builder phase B${nums[$i]}"; fi
    done

    echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
    success "BUILDER GRILL-ME + DEBRIEF COMPLETE in $(( $(date +%s) - start_time ))s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
