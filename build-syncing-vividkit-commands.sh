#!/bin/bash
# ==============================================================================
# Script: build-syncing-vividkit-commands.sh
# Description: Upgrade watcher + builder to latest VividKit commands.
#              Run ONCE to sync all flows with CK v2.14.0+ command set.
#
# Usage:
#   ./build-syncing-vividkit-commands.sh --auto --budget 20    # full run
#   ./build-syncing-vividkit-commands.sh --phase 1 --auto      # single phase
#   ./build-syncing-vividkit-commands.sh --from 3 --auto       # resume
#   ./build-syncing-vividkit-commands.sh --dry-run             # preview
#
# Phases:
#   1 — Upgrade debug-flow.ts (/ck:fix 6-step pipeline + flags)
#   2 — Upgrade ship-flow.ts (no PR — stops at commit)
#   3 — Add test-flow.ts (new: /ck:scenario + /ck:test variants)
#   4 — Add security-flow.ts (new: scan + STRIDE + auto-fix)
#   5 — Verify + Ship gate (/ck:ship as verify, fallback to branch-manager)
#   6 — Upgrade builder (build run uses /ck:ship)
#   7 — Watcher integration (wire new flows into poll cycle)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap-vividkit-commands.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/vividkit-sync-$(date +%Y%m%d-%H%M%S).log"
PLAN_DIR="$PROJECT_ROOT/plans"

# Defaults
DRY_RUN=""
AUTO_MODE=""
SINGLE_PHASE=""
FROM_PHASE=""
BUDGET_PER_CALL="10.00"

# Colors
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
    local prompt="$1"
    local model="${2:-sonnet}"
    local effort="${3:-medium}"
    local budget="${4:-$BUDGET_PER_CALL}"

    local flags="--model $model --effort $effort --output-format text --max-budget-usd $budget"
    [[ "$AUTO_MODE" == "true" ]] && flags="$flags --dangerously-skip-permissions"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] claude -p \"${prompt:0:100}...\" --model $model --effort $effort --budget \$$budget"
        return 0
    fi

    info "Claude ($model, effort=$effort, budget=\$$budget): ${prompt:0:80}..."
    # shellcheck disable=SC2086
    claude -p "$prompt" $flags 2>&1 | tee -a "$LOG_FILE"
    local exit_code=${PIPESTATUS[0]}
    [[ $exit_code -ne 0 ]] && warn "Claude exited with code $exit_code"
    return $exit_code
}

find_latest_plan() {
    find "$PLAN_DIR" -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}

run_plan() {
    local description="$1"
    local effort="${2:-high}"
    local roadmap_content
    roadmap_content=$(cat "$ROADMAP")
    run_claude "/ck:plan --fast $description

Reference roadmap:
$roadmap_content" "opus" "$effort" "$BUDGET_PER_CALL"
}

run_cook() {
    local plan_path
    plan_path=$(find_latest_plan)
    if [[ -z "$plan_path" ]]; then
        warn "No plan.md found — cooking from roadmap"
        local roadmap_content
        roadmap_content=$(cat "$ROADMAP")
        run_claude "/ck:cook --auto Implement based on this roadmap:

$roadmap_content" "sonnet" "medium" "$BUDGET_PER_CALL"
        return $?
    fi
    info "Cooking from: $plan_path"
    run_claude "/ck:cook --auto $plan_path" "sonnet" "medium" "$BUDGET_PER_CALL"
}

run_test() {
    info "Testing..."
    run_claude "/ck:test Run all tests and report results." "sonnet" "low" "5.00"
}

run_ship() {
    info "Committing..."
    run_claude "/ck:git cm Stage and commit all changes." "sonnet" "low" "1.00"
}

confirm_proceed() {
    local next="$1"
    if [[ "$AUTO_MODE" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then return 0; fi
    echo ""
    read -p "$(echo -e "${YELLOW}Proceed? [Y/n]${NC} ")" confirm
    [[ "${confirm:-Y}" =~ ^[Nn] ]] && { warn "Paused. Resume: $0 --from $next"; exit 0; }
}

# ------------------------------------------------------------------------------
# Phases
# ------------------------------------------------------------------------------

phase_1() {
    header "Phase 1: Upgrade debug-flow.ts"
    run_plan "Upgrade debug-flow.ts to VividKit 6-step /ck:fix pipeline. Replace /ck:debug then /ck:fix then /ck:test with single /ck:fix call. Add flag routing: --hard for hard label, --quick for simple bugs, --security for security label, --ci for CI failures, --ui for frontend label, --logs when issue has log content. Keep retry loop max 3 using /ck:fix per cycle. Add /ck:problem-solving when-stuck fallback after max retries."
    confirm_proceed 2
    run_cook
    run_test
    run_ship
    success "Phase 1 complete"
}

phase_2() {
    header "Phase 2: Upgrade ship-flow.ts"
    run_plan "Upgrade ship-flow.ts. Add optional /ck:brainstorm when issue lacks spec. Use /ck:plan validate after plan creation. Add /ck:plan red-team for hard labeled features. Keep /ck:cook @plan.md --auto. Add /ck:scout after cook for edge cases. Add /ck:code-review after cook. IMPORTANT: Remove PR creation from ship-flow. Ship-flow now ENDS at commitChanges. No push, no PR. The PR is created later by /ck:ship in post-ship verify gate. Keep createPullRequest in branch-manager.ts UNTOUCHED for fallback."
    confirm_proceed 3
    run_cook
    run_test
    run_ship
    success "Phase 2 complete"
}

phase_3() {
    header "Phase 3: Add test-flow.ts"
    run_plan "Create new src/commands/watch/phases/test-flow.ts module. Add /ck:scenario to generate BDD/Gherkin test scenarios from issue content. Add /ck:test for unit and integration tests. Add /ck:test --e2e for browser E2E tests wired to e2e-runner.ts. Add /ck:test --ui for visual UI tests. Route test type based on issue labels: frontend label triggers --ui, E2E scenarios in issue body triggers --e2e."
    confirm_proceed 4
    run_cook
    run_test
    run_ship
    success "Phase 3 complete"
}

phase_4() {
    header "Phase 4: Add security-flow.ts"
    run_plan "Create new src/commands/watch/phases/security-flow.ts module. Add /ck:security-scan for OWASP plus secrets plus dependency scan. Add /ck:code-review --security for deep security review. Add /ck:security for full STRIDE threat modeling. Add /ck:fix --security to auto-fix found issues. Wire into post-ship-runner.ts when security label is present."
    confirm_proceed 5
    run_cook
    run_test
    run_ship
    success "Phase 4 complete"
}

phase_5() {
    header "Phase 5: Verify + Ship Gate (/ck:ship with fallback)"
    run_plan "Upgrade post-ship-runner.ts verify gate. Wire /ck:ship --official as PRIMARY verify and PR path. /ck:ship includes: merge main, run tests, 2-pass review with red-team, bump version, changelog, push, create PR. On /ck:ship failure, FALLBACK to createPullRequest from branch-manager.ts which is UNTOUCHED old code. Add /ck:scout before /ck:ship for edge cases. Add /ck:predict for large changes. Log which path was used. PASS means /ck:ship succeeded. FAIL means both /ck:ship and fallback failed."
    confirm_proceed 6
    run_cook
    run_test
    run_ship
    success "Phase 5 complete"
}

phase_6() {
    header "Phase 6: Upgrade Builder"
    run_plan "Upgrade epic-executor.ts in builder tool. build generate uses /ck:brainstorm then /ck:plan --hard for roadmap creation. build run uses /ck:ship --official as verify plus PR with fallback to createPullRequest. build run --hard adds /ck:plan red-team and /ck:predict. build generate adds /ck:scenario to generate test cases."
    confirm_proceed 7
    run_cook
    run_test
    run_ship
    success "Phase 6 complete"
}

phase_7() {
    header "Phase 7: Watcher Integration"
    run_plan "Wire all new flows into watch-command.ts poll cycle. Update issue-router.ts to detect CI, logs, UI, security sub-types from issue labels and content. Wire test-flow.ts into post-ship-runner.ts. Wire security-flow.ts into post-ship-runner.ts when security label present. Update model-router.ts with new phase configs for test and security flows. Add /ck:retro call at end of nightly run. Add /ck:watzup call at start of each poll cycle."
    confirm_proceed 7
    run_cook
    run_test

    # Final phase: commit + push
    info "Final commit + push..."
    run_claude "/ck:git cp Stage, commit and push all changes." "sonnet" "low" "1.00"

    success "Phase 7 complete — VividKit sync done"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

main() {
    local start_time=$(date +%s)

    info "=========================================="
    info "VividKit Commands Sync"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: $SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: Phase $FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto (YOLO)"
    info "Budget per call: \$$BUDGET_PER_CALL"
    info "=========================================="

    cd "$PROJECT_ROOT"

    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    command -v gh &>/dev/null || { error "GitHub CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            1) phase_1 ;; 2) phase_2 ;; 3) phase_3 ;; 4) phase_4 ;;
            5) phase_5 ;; 6) phase_6 ;; 7) phase_7 ;;
            *) error "Unknown phase: $SINGLE_PHASE (valid: 1-7)"; exit 1 ;;
        esac
        local elapsed=$(( $(date +%s) - start_time ))
        success "Phase $SINGLE_PHASE done in ${elapsed}s"
        echo "Log: $LOG_FILE"
        return
    fi

    local start=1
    [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"

    local phases=(phase_1 phase_2 phase_3 phase_4 phase_5 phase_6 phase_7)
    local nums=(1 2 3 4 5 6 7)

    for i in "${!phases[@]}"; do
        if [[ "${nums[$i]}" -ge "$start" ]]; then
            ${phases[$i]}
        else
            info "Skipping Phase ${nums[$i]} (resuming from $start)"
        fi
    done

    local elapsed=$(( $(date +%s) - start_time ))
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    success "VIVIDKIT SYNC COMPLETE in ${elapsed}s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
