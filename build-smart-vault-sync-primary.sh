#!/bin/bash
# ==============================================================================
# Script: build-smart-vault-sync-primary.sh
# Description: Build PRIMARY smart vault work only.
#              Focus: inside the current target project first.
#              Phases: P1-P6.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap-smart-vault-sync.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/vault-sync-primary-$(date +%Y%m%d-%H%M%S).log"
PLAN_DIR="$PROJECT_ROOT/plans"

DRY_RUN=""
AUTO_MODE=""
SINGLE_PHASE=""
FROM_PHASE=""
BUDGET_PER_CALL="10.00"
MAX_RETRIES=3
RETRY_DELAY_SECONDS=5

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

p1() {
    header "P1: Project Note Classifier"
    run_plan "Create src/commands/sync/note-classifier.ts. Primary-first scope only. Classify project-inside notes for the active target. Use Claude haiku with structured output. Categories: lesson, pattern, decision, foundation, project-specific. Batch mode supported."
    confirm 2
    run_cook
    run_test
    run_ship
    success "P1 complete"
}

p2() {
    header "P2: Project Knowledge Capture"
    run_plan "Implement project-inside knowledge capture first. Extend local vault structure for Knowledge/Lessons, Knowledge/Patterns, Knowledge/Decisions. Teach journal-writer and run-recorder outputs to feed local project knowledge first. Add roadmap-loader reminder/record step after successful ck:cook in executeFromRoadmap(). Store provenance in frontmatter."
    confirm 3
    run_cook
    run_test
    run_ship
    success "P2 complete"
}

p3() {
    header "P3: Project Context Reuse"
    run_plan "Upgrade vault-context-loader.ts for local-first retrieval. Read curated project Knowledge notes before raw Notes. Rank by task relevance, recency, and category priority. Inject project-inside context before watcher ck:plan and roadmap-loader ck:cook. Do not depend on global/shared notes in primary mode."
    confirm 4
    run_cook
    run_test
    run_ship
    success "P3 complete"
}

p4() {
    header "P4: Primary Metadata + Safety"
    run_plan "Add project-inside metadata and safety rules. Track provenance in frontmatter for captured notes. Prevent bad reprocessing. Keep local memory artifacts attributable to issue, task, project, and source phase."
    confirm 5
    run_cook
    run_test
    run_ship
    success "P4 complete"
}

p5() {
    header "P5: Watcher Integration"
    run_plan "Wire primary inside-project memory into watcher only. After journal-writer and run-recorder, update local project knowledge. Before ck:plan, load local project knowledge. One-shot per cycle only. No global/shared sync in this phase."
    confirm 6
    run_cook
    run_test
    run_ship
    success "P5 complete"
}

p6() {
    header "P6: Builder / Roadmap Loader Integration"
    run_plan "Wire primary inside-project memory into src/commands/build/epic-executor.ts, especially executeFromRoadmap(). After successful ck:cook, add reminder/record step, write run summary and lesson candidate, then continue to commit. Keep focus on project-inside memory only."
    confirm 6
    run_cook
    run_test
    success "P6 complete — primary smart vault work done"
}

main() {
    local start_time=$(date +%s)
    info "=========================================="
    info "Smart Vault Sync PRIMARY"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: P$SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: P$FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto"
    info "Budget per call: \$$BUDGET_PER_CALL"
    info "=========================================="

    cd "$PROJECT_ROOT"
    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            1) p1 ;;
            2) p2 ;;
            3) p3 ;;
            4) p4 ;;
            5) p5 ;;
            6) p6 ;;
            *) error "Unknown primary phase (valid: 1-6)"; exit 1 ;;
        esac
        success "Primary phase P$SINGLE_PHASE done in $(( $(date +%s) - start_time ))s"
        echo "Log: $LOG_FILE"
        return
    fi

    local start=1; [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"
    local phases=(p1 p2 p3 p4 p5 p6)
    local nums=(1 2 3 4 5 6)

    for i in "${!phases[@]}"; do
        if [[ "${nums[$i]}" -ge "$start" ]]; then
            ${phases[$i]}
        else
            info "Skipping primary phase P${nums[$i]}"
        fi
    done

    echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
    success "PRIMARY SMART VAULT WORK COMPLETE in $(( $(date +%s) - start_time ))s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
