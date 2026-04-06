#!/bin/bash
# ==============================================================================
# Script: build-smart-vault-sync.sh
# Description: Build the smart vault sync feature for claude-swarm.
#              8 phases, 48 tasks. Run once to implement all.
#
# Usage:
#   ./build-smart-vault-sync.sh --auto --budget 20    # full run
#   ./build-smart-vault-sync.sh --phase 1 --auto      # single phase
#   ./build-smart-vault-sync.sh --from 3 --auto       # resume
#   ./build-smart-vault-sync.sh --dry-run             # preview
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap-smart-vault-sync.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/vault-sync-$(date +%Y%m%d-%H%M%S).log"
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

# Phases

phase_1() {
    header "Phase 1: Note Classifier"
    run_plan "Create src/commands/sync/note-classifier.ts. Spawn Claude haiku to classify notes as promote or skip. Use --json-schema for structured output. Categories: lesson, pattern, decision, foundation, project-specific. Batch mode to classify multiple notes in one call. Output: { action: promote|skip, reason, category }."
    confirm 2; run_cook; run_test; run_ship
    success "Phase 1 complete"
}

phase_2() {
    header "Phase 2: Smart Pull (project → second-brain)"
    run_plan "Create src/commands/sync/smart-pull.ts. Read all notes from project vault (Daily, Notes, Decisions). Skip notes already in second-brain by filename. Classify new notes via note-classifier. Copy promote notes to correct second-brain folder. Log skipped notes with reason. Add frontmatter source-project and promoted-date. Dry-run mode. Read project paths from projects.json with tilde expansion."
    confirm 3; run_cook; run_test; run_ship
    success "Phase 2 complete"
}

phase_3() {
    header "Phase 3: Smart Push (second-brain → project)"
    run_plan "Create src/commands/sync/smart-push.ts. Accept context: issue title or task spec. Read all second-brain notes from _lessons, _patterns, _decisions. Classify relevance to context via Claude sonnet. Copy relevant notes to project vault Notes. Skip already-present notes. Add frontmatter injected-from: second-brain and injected-for context. Dry-run mode."
    confirm 4; run_cook; run_test; run_ship
    success "Phase 3 complete"
}

phase_4() {
    header "Phase 4: Alignment Check"
    run_plan "Create src/commands/sync/alignment-checker.ts. Compare same-named notes across project vault and second-brain. Claude detects outdated, contradicting, superseded notes. Report which notes need updating and direction. Auto-update option: newer wins with backup."
    confirm 5; run_cook; run_test; run_ship
    success "Phase 4 complete"
}

phase_5() {
    header "Phase 5: CLI Wiring"
    run_plan "Create src/commands/sync/sync-command.ts. Wire into CLI as claude-swarm sync. Subcommands: sync pull (all or --project), sync push (--project --context), sync check (all or --project). Add --dry-run and --force (dumb copy fallback) on all subcommands. Read projects.json for registry."
    confirm 6; run_cook; run_test; run_ship
    success "Phase 5 complete"
}

phase_6() {
    header "Phase 6: Loop Prevention"
    run_plan "Add loop prevention to smart-pull.ts and smart-push.ts. Rule 1: pull and push never chain in same cycle. Rule 2: skip notes with injected-from frontmatter in smart-pull. Rule 3: skip notes with source-project frontmatter in smart-push. Add synced-at timestamp to prevent reprocessing."
    confirm 7; run_cook; run_test; run_ship
    success "Phase 6 complete"
}

phase_7() {
    header "Phase 7: Watcher Integration"
    run_plan "Wire smart sync into watcher. After journal-writer runs trigger smart-pull ONCE. Before ck:plan runs trigger smart-push ONCE with issue context. Wire into post-ship-runner.ts. Respect loop prevention rules. One-shot per cycle only."
    confirm 8; run_cook; run_test; run_ship
    success "Phase 7 complete"
}

phase_8() {
    header "Phase 8: Builder Integration"
    run_plan "Wire smart sync into builder epic-executor.ts. build generate: smart-push before brainstorm. build run: smart-push before each issue ck:plan, smart-pull after each issue completes. build from-scratch: smart-push at start, smart-pull at end. Respect loop prevention rules."
    confirm 8; run_cook; run_test

    info "Final commit + push..."
    run_claude "/ck:git cp Stage, commit and push all changes." "sonnet" "low" "1.00"

    success "Phase 8 complete — Smart Vault Sync done"
}

# Main

main() {
    local start_time=$(date +%s)
    info "=========================================="; info "Smart Vault Sync"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: $SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: Phase $FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto (YOLO)"
    info "Budget per call: \$$BUDGET_PER_CALL"
    info "=========================================="

    cd "$PROJECT_ROOT"
    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            1) phase_1 ;; 2) phase_2 ;; 3) phase_3 ;; 4) phase_4 ;;
            5) phase_5 ;; 6) phase_6 ;; 7) phase_7 ;; 8) phase_8 ;;
            *) error "Unknown phase (valid: 1-8)"; exit 1 ;;
        esac
        success "Phase $SINGLE_PHASE done in $(( $(date +%s) - start_time ))s"
        echo "Log: $LOG_FILE"; return
    fi

    local start=1; [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"
    local phases=(phase_1 phase_2 phase_3 phase_4 phase_5 phase_6 phase_7 phase_8)
    local nums=(1 2 3 4 5 6 7 8)

    for i in "${!phases[@]}"; do
        [[ "${nums[$i]}" -ge "$start" ]] && ${phases[$i]} || info "Skipping Phase ${nums[$i]}"
    done

    echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
    success "SMART VAULT SYNC COMPLETE in $(( $(date +%s) - start_time ))s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
