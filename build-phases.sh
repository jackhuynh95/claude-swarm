#!/bin/bash
# ==============================================================================
# Script: build-phases.sh
# Description: Execute claude-swarm implementation roadmap phase by phase.
#              Each phase: /ck:plan → /ck:cook → /test → /ck:ship
#
# Usage:
#   ./build-phases.sh                    # run all phases sequentially
#   ./build-phases.sh --phase 0          # run specific phase
#   ./build-phases.sh --phase 3 --hard   # hard phase (plan + red-team + review)
#   ./build-phases.sh --phase 4 --parallel  # parallel execution
#   ./build-phases.sh --from 2           # resume from phase 2
#   ./build-phases.sh --dry-run          # show commands without executing
#   ./build-phases.sh --auto             # skip all confirmations (YOLO)
#   ./build-phases.sh --ship-to beta     # ship target (beta or official)
#
# Requirements:
#   - Claude CLI installed and authenticated
#   - CK >= v2.14.0 (for /ck: prefix commands)
#   - gh CLI authenticated
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/build-$(date +%Y%m%d-%H%M%S).log"
PLAN_DIR="$PROJECT_ROOT/plans"

# Defaults
DRY_RUN=""
AUTO_MODE=""
SINGLE_PHASE=""
FROM_PHASE=""
HARD_MODE=""
PARALLEL_MODE=""
SHIP_TARGET="beta"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse flags
ARGS=("$@")
for i in "${!ARGS[@]}"; do
    case "${ARGS[$i]}" in
        --dry-run)   DRY_RUN="true" ;;
        --auto)      AUTO_MODE="true" ;;
        --hard)      HARD_MODE="true" ;;
        --parallel)  PARALLEL_MODE="true" ;;
        --phase)     SINGLE_PHASE="${ARGS[$((i+1))]:-}" ;;
        --from)      FROM_PHASE="${ARGS[$((i+1))]:-}" ;;
        --ship-to)   SHIP_TARGET="${ARGS[$((i+1))]:-beta}" ;;
    esac
done

mkdir -p "$LOG_DIR" "$PLAN_DIR"

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------

log() { echo -e "[$1] $2" | tee -a "$LOG_FILE"; }
info() { log "INFO" "${BLUE}$*${NC}"; }
success() { log "OK" "${GREEN}$*${NC}"; }
warn() { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }
header() { echo -e "\n${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"; log "PHASE" "${CYAN}$*${NC}"; echo -e "${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"; }

# ------------------------------------------------------------------------------
# Claude CLI wrapper
# ------------------------------------------------------------------------------

run_claude() {
    local prompt="$1"
    local model="${2:-sonnet}"
    local effort="${3:-medium}"
    local max_turns="${4:-5}"
    local flags=""

    [[ "$AUTO_MODE" == "true" ]] && flags="--dangerously-skip-permissions"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] claude -p \"${prompt:0:80}...\" --model $model --effort $effort --max-turns $max_turns"
        return 0
    fi

    info "Claude ($model, effort=$effort, turns=$max_turns): ${prompt:0:80}..."

    claude -p "$prompt" \
        --model "$model" \
        --effort "$effort" \
        --max-turns "$max_turns" \
        --output-format text \
        $flags 2>&1 | tee -a "$LOG_FILE"

    return ${PIPESTATUS[0]}
}

# ------------------------------------------------------------------------------
# Phase runner
# ------------------------------------------------------------------------------

find_latest_plan() {
    find "$PLAN_DIR" -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}

run_plan() {
    local phase_num="$1"
    local description="$2"
    local plan_effort="${3:-high}"

    info "Planning Phase $phase_num..."
    run_claude "/ck:plan --fast @$ROADMAP $description" "opus" "$plan_effort" "8"
}

run_plan_hard() {
    local phase_num="$1"
    local description="$2"

    info "Planning Phase $phase_num (full plan + red-team)..."
    run_claude "/ck:plan @$ROADMAP $description" "opus" "max" "10"

    local plan_path=$(find_latest_plan)
    if [[ -n "$plan_path" ]]; then
        info "Red-team review..."
        run_claude "/ck:plan red-team @$plan_path" "opus" "high" "5"
    fi
}

run_cook() {
    local plan_path=$(find_latest_plan)
    if [[ -z "$plan_path" ]]; then
        error "No plan found"
        return 1
    fi

    info "Cooking: $plan_path"
    run_claude "/ck:cook --auto @$plan_path" "sonnet" "medium" "10"
}

run_cook_parallel() {
    local description="$1"

    info "Parallel cook: $description"
    run_claude "/ck:team implement '$description' --devs 2 --reviewers 1" "sonnet" "medium" "10"
}

run_test() {
    info "Testing..."
    run_claude "/test" "sonnet" "low" "3"
}

run_review() {
    local description="$1"
    info "Team review: $description"
    run_claude "/ck:team review '$description' --reviewers 2" "sonnet" "medium" "5"
}

run_security() {
    info "Security scan..."
    run_claude "/ck:security-scan --full" "sonnet" "medium" "3"
}

run_ship() {
    info "Shipping to $SHIP_TARGET..."
    run_claude "/ck:ship --$SHIP_TARGET" "sonnet" "medium" "5"
}

confirm_proceed() {
    if [[ "$AUTO_MODE" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi

    echo ""
    read -p "$(echo -e "${YELLOW}Proceed to next step? [Y/n]${NC} ")" confirm
    if [[ "${confirm:-Y}" =~ ^[Nn] ]]; then
        warn "Paused by user. Resume with: $0 --from $1"
        exit 0
    fi
}

# ------------------------------------------------------------------------------
# Phase definitions
# ------------------------------------------------------------------------------

phase_0_1() {
    header "Phase 0+1: Foundation + CK v2.14.0 Migration"

    run_plan "0+1" "Implement Phase 0 (CK v2.14.0 command migration) and Phase 1 (Foundation). Tasks: migrate /code:* to /ck:cook prefix, set up project structure (docs/, obsidian-vault/, .claude/), verify CK watch daemon runs, create obsidian-vault/ skeleton, create CLAUDE.md, set up GitHub labels."

    confirm_proceed 2
    run_cook
    run_test
    run_ship

    success "Phase 0+1 complete"
}

phase_2() {
    header "Phase 2: Issue Router"

    run_plan "2" "Implement Phase 2 (Issue Router). Tasks: create issue-router.ts with label + type detection, create model-router.ts for opus/sonnet/haiku per phase, wire router into CK poll cycle replacing single-track dispatch, add type detection ([BUG] → debug-flow, [FEATURE] → ship-flow), add smart label injection (hard → opus, frontend → design-review), add [DOCS/CHORE] → ship-flow --no-test."

    confirm_proceed 3
    run_cook
    run_test
    run_ship

    success "Phase 2 complete"
}

phase_3() {
    header "Phase 3: Execution Flows (HARD)"

    run_plan_hard "3" "Implement Phase 3 (Execution Flows). Tasks: create debug-flow.ts (/debug → /fix → /test retry loop), create ship-flow.ts (/ck:plan --fast → /ck:cook --auto → PR), port Claude CLI subprocess spawning with timeout (SIGTERM → 5s → SIGKILL), port branch setup + commit + PR creation, port label transitions (ready_for_dev → shipped → verified), add clarifying phase."

    confirm_proceed 3
    run_cook
    run_review "Phase 3 execution flows"
    run_test
    run_ship

    success "Phase 3 complete"
}

phase_4() {
    header "Phase 4: Post-Ship Phases"

    if [[ "$PARALLEL_MODE" == "true" ]]; then
        run_cook_parallel "Phase 4: build verifier.ts, e2e-runner.ts, slack-reporter.ts, design-reviewer.ts, journal-writer.ts as independent modules. Wire all into watcher lifecycle after implementation phase."
    else
        run_plan "4" "Implement Phase 4 (Post-Ship Phases). Tasks: create verifier.ts (independent verify agent PASS/FAIL/PARTIAL), create e2e-runner.ts (agent-browser E2E testing), create slack-reporter.ts (/slack-report to team), create design-reviewer.ts (frontend-design, manual trigger only), create journal-writer.ts (obsidian-vault Daily + Notes), wire all post-ship phases into watcher lifecycle."

        confirm_proceed 5
        run_cook
    fi

    run_test
    run_ship

    success "Phase 4 complete"
}

phase_5() {
    header "Phase 5: Standalone CLI Tools"

    run_plan "5" "Implement Phase 5 (Standalone CLI Tools). Tasks: create slack-reader.ts (/slack-read task extraction), create brainstormer.ts (/brainstorm → /issue pipeline), create CLI entry points (claude-swarm read, claude-swarm brainstorm), port report-issue standalone mode." "medium"

    confirm_proceed 6
    run_cook
    run_test
    run_ship

    success "Phase 5 complete"
}

phase_6() {
    header "Phase 6: Safety & Reliability"

    run_plan "6" "Implement Phase 6 (Safety & Reliability). Tasks: add sensitive data filter (strip secrets before posting to GitHub), add response truncation (GitHub API limits), add AI disclaimer to bot comments, add comment loop prevention (detect own bot comments), add maintainer-last detection, add budget guards (per-worker token caps, continuation limits), add nightly cost summary, add conversation history tracking across phases."

    confirm_proceed 7
    run_cook
    run_security
    run_test
    run_ship

    success "Phase 6 complete"
}

phase_7() {
    header "Phase 7: Obsidian Vault Integration"

    run_plan "7" "Implement Phase 7 (Obsidian Vault Integration). Tasks: create /obsidian-journal skill (daily journal + lesson extraction), wire journal-writer as post-ship phase, add context loading (read obsidian-vault/Notes before planning), implement daily journal format, implement notes extraction with [[wikilinks]], implement Review/Runs test result storage."

    confirm_proceed 8
    run_cook
    run_test

    # Phase 7+ ships to official (production-ready)
    SHIP_TARGET="official"
    run_ship

    success "Phase 7 complete"
}

phase_8() {
    header "Phase 8: Operator UX & Observability"

    run_plan "8" "Implement Phase 8 (Operator UX & Observability). Tasks: create claude-swarm status command (active tasks, queue, results), create run history/resume index, implement task metadata layer (id, role, start/end, status, exit reason, artifacts), create capability matrix, create searchable plan/run/review index." "medium"

    confirm_proceed 8
    run_cook
    run_review "Full claude-swarm v2.0"
    run_test

    SHIP_TARGET="official"
    run_ship

    success "Phase 8 complete"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

main() {
    info "=========================================="
    info "claude-swarm build"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: $SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: Phase $FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto (YOLO)"
    [[ "$HARD_MODE" == "true" ]] && info "Mode: hard (red-team)"
    [[ "$PARALLEL_MODE" == "true" ]] && info "Mode: parallel"
    info "Ship target: $SHIP_TARGET"
    info "=========================================="

    cd "$PROJECT_ROOT"

    # Pre-flight
    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    command -v gh &>/dev/null || { error "GitHub CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    # Single phase mode
    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            0|1) phase_0_1 ;;
            2)   phase_2 ;;
            3)   phase_3 ;;
            4)   phase_4 ;;
            5)   phase_5 ;;
            6)   phase_6 ;;
            7)   phase_7 ;;
            8)   phase_8 ;;
            *)   error "Unknown phase: $SINGLE_PHASE"; exit 1 ;;
        esac
        return
    fi

    # Determine starting phase
    local start=0
    [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"

    # Run phases sequentially
    local phases=(phase_0_1 phase_2 phase_3 phase_4 phase_5 phase_6 phase_7 phase_8)
    local phase_nums=(0 2 3 4 5 6 7 8)

    for i in "${!phases[@]}"; do
        if [[ "${phase_nums[$i]}" -ge "$start" ]]; then
            ${phases[$i]}
        else
            info "Skipping Phase ${phase_nums[$i]} (resuming from $start)"
        fi
    done

    # Final summary
    local duration=$(( $(date +%s) - $(date -j -f "%Y%m%d-%H%M%S" "$(basename "$LOG_FILE" .log | sed 's/build-//')" +%s 2>/dev/null || echo 0) ))

    echo ""
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    success "BUILD COMPLETE"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
    echo ""
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
