#!/bin/bash
# ==============================================================================
# Script: build-phases.sh
# Description: Execute claude-swarm implementation roadmap phase by phase.
#              Each phase: plan → cook → test → ship
#              Uses claude -p with proper CLI flags.
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
#   ./build-phases.sh --budget 5.00      # max USD per phase (default: 3.00)
#
# Requirements:
#   - Claude CLI installed and authenticated
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
BUDGET_PER_PHASE="3.00"

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
        --budget)    BUDGET_PER_PHASE="${ARGS[$((i+1))]:-3.00}" ;;
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
header() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    log "PHASE" "${CYAN}$*${NC}"
    echo -e "${CYAN}══════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
}

# ------------------------------------------------------------------------------
# Claude CLI wrapper
# ------------------------------------------------------------------------------

run_claude() {
    local prompt="$1"
    local model="${2:-sonnet}"
    local effort="${3:-medium}"
    local budget="${4:-$BUDGET_PER_PHASE}"
    local extra_flags="${5:-}"

    # Build flags
    local flags="--model $model --effort $effort --output-format text --max-budget-usd $budget"

    # Permission mode
    if [[ "$AUTO_MODE" == "true" ]]; then
        flags="$flags --permission-mode auto"
    fi

    # Extra flags (e.g., --allowedTools)
    [[ -n "$extra_flags" ]] && flags="$flags $extra_flags"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY RUN] claude -p \"${prompt:0:100}...\" $flags"
        return 0
    fi

    info "Claude ($model, effort=$effort, budget=\$$budget): ${prompt:0:80}..."

    # shellcheck disable=SC2086
    claude -p "$prompt" $flags 2>&1 | tee -a "$LOG_FILE"

    local exit_code=${PIPESTATUS[0]}
    if [[ $exit_code -ne 0 ]]; then
        warn "Claude exited with code $exit_code"
    fi
    return $exit_code
}

# Convenience wrappers for common patterns
run_plan() {
    local description="$1"
    local effort="${2:-high}"
    local budget="${3:-$BUDGET_PER_PHASE}"

    # Read roadmap content and inject into prompt
    local roadmap_content
    roadmap_content=$(cat "$ROADMAP")

    # Use /ck:plan (CK skill) — falls back to plain prompt if skill unavailable
    run_claude "/ck:plan --fast $description

Reference roadmap:
$roadmap_content" "opus" "$effort" "$budget"
}

run_plan_hard() {
    local description="$1"
    local budget="${2:-$BUDGET_PER_PHASE}"

    local roadmap_content
    roadmap_content=$(cat "$ROADMAP")

    # Full plan (opus, max effort)
    run_claude "/ck:plan $description

Reference roadmap:
$roadmap_content" "opus" "max" "$budget"

    # Red-team review
    local plan_path
    plan_path=$(find_latest_plan)
    if [[ -n "$plan_path" ]]; then
        info "Red-team review of plan..."
        run_claude "/ck:plan red-team $plan_path" "opus" "high" "1.00"
    fi
}

run_cook() {
    local plan_path
    plan_path=$(find_latest_plan)
    if [[ -z "$plan_path" ]]; then
        # No plan file found — cook directly from roadmap
        warn "No plan.md found in $PLAN_DIR — cooking from roadmap directly"
        local roadmap_content
        roadmap_content=$(cat "$ROADMAP")
        run_claude "/ck:cook --auto Implement based on this roadmap:

$roadmap_content" "sonnet" "medium" "$BUDGET_PER_PHASE"
        return $?
    fi

    info "Cooking from: $plan_path"
    run_claude "/ck:cook --auto $plan_path" "sonnet" "medium" "$BUDGET_PER_PHASE"
}

run_test() {
    info "Running tests..."
    run_claude "/test Run all tests and report results." "sonnet" "low" "1.00"
}

run_review() {
    local description="$1"
    info "Code review: $description"
    run_claude "Review the recent code changes for $description. Check for bugs, security issues, and code quality. Report PASS/FAIL with evidence." "sonnet" "medium" "1.00" "--allowedTools Read,Grep,Glob"
}

run_security() {
    info "Security scan..."
    run_claude "/ck:security-scan Run a security review. Check for hardcoded secrets, injection vulnerabilities, auth issues, OWASP Top 10." "sonnet" "medium" "1.00" "--allowedTools Read,Grep,Glob,Bash"
}

run_ship() {
    info "Shipping to $SHIP_TARGET..."
    run_claude "/git:cm Stage and commit all changes." "sonnet" "low" "0.50"
}

find_latest_plan() {
    find "$PLAN_DIR" -name "plan.md" -type f -exec stat -f "%m %N" {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}

confirm_proceed() {
    local next_phase="$1"

    if [[ "$AUTO_MODE" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi

    echo ""
    read -p "$(echo -e "${YELLOW}Proceed to next step? [Y/n]${NC} ")" confirm
    if [[ "${confirm:-Y}" =~ ^[Nn] ]]; then
        warn "Paused by user. Resume with: $0 --from $next_phase"
        exit 0
    fi
}

# ------------------------------------------------------------------------------
# Phase definitions
# ------------------------------------------------------------------------------

phase_0_1() {
    header "Phase 0+1: Foundation + CK v2.14.0 Migration"

    run_plan "Implement Phase 0 (CK v2.14.0 command migration) and Phase 1 (Foundation). Tasks: migrate all /code:* references to /ck:cook prefix, set up project structure (docs/, obsidian-vault/, .claude/), verify CK watch daemon runs from fork, create obsidian-vault/ skeleton (Daily/, Notes/, Review/, Decisions/), create CLAUDE.md with project conventions, set up GitHub labels (ready_for_dev, shipped, verified)."

    confirm_proceed 2
    run_cook
    run_test
    run_ship

    success "Phase 0+1 complete"
}

phase_2() {
    header "Phase 2: Issue Router"

    run_plan "Implement Phase 2 (Issue Router). Tasks: create issue-router.ts with label + type detection, create model-router.ts for opus/sonnet/haiku per phase, wire router into CK poll cycle replacing single-track dispatch, add type detection ([BUG] to debug-flow, [FEATURE] to ship-flow), add smart label injection (hard label to opus, frontend label to design-review), add [DOCS/CHORE] to ship-flow with no-test."

    confirm_proceed 3
    run_cook
    run_test
    run_ship

    success "Phase 2 complete"
}

phase_3() {
    header "Phase 3: Execution Flows (HARD)"

    run_plan_hard "Implement Phase 3 (Execution Flows). Tasks: create debug-flow.ts with /debug then /fix then /test retry loop, create ship-flow.ts with /plan:fast then /ck:cook --auto then PR, port Claude CLI subprocess spawning with timeout (SIGTERM then 5s then SIGKILL), port branch setup + commit + PR creation, port label transitions (ready_for_dev to shipped to verified), add clarifying phase where Claude asks spec questions and waits for reply."

    confirm_proceed 3
    run_cook
    run_review "Phase 3 execution flows"
    run_test
    run_ship

    success "Phase 3 complete"
}

phase_4() {
    header "Phase 4: Post-Ship Phases"

    run_plan "Implement Phase 4 (Post-Ship Phases). Tasks: create verifier.ts (independent verify agent with PASS/FAIL/PARTIAL verdict), create e2e-runner.ts (agent-browser E2E testing), create slack-reporter.ts (/slack-report to team), create design-reviewer.ts (frontend-design review, manual trigger only), create journal-writer.ts (obsidian-vault Daily + Notes extraction), wire all post-ship phases into watcher lifecycle."

    confirm_proceed 5
    run_cook
    run_test
    run_ship

    success "Phase 4 complete"
}

phase_5() {
    header "Phase 5: Standalone CLI Tools"

    run_plan "Implement Phase 5 (Standalone CLI Tools). Tasks: create slack-reader.ts for /slack-read task extraction, create brainstormer.ts for /brainstorm to /issue pipeline, create CLI entry points (claude-swarm read, claude-swarm brainstorm), port report-issue standalone mode." "medium"

    confirm_proceed 6
    run_cook
    run_test
    run_ship

    success "Phase 5 complete"
}

phase_6() {
    header "Phase 6: Safety & Reliability"

    run_plan "Implement Phase 6 (Safety & Reliability). Tasks: add sensitive data filter to strip secrets before posting to GitHub, add response truncation for GitHub API limits, add AI disclaimer to bot comments, add comment loop prevention to detect own bot comments and skip, add maintainer-last detection, add budget guards with per-worker token caps and continuation limits, add nightly cost summary, add conversation history tracking across phases."

    confirm_proceed 7
    run_cook
    run_security
    run_test
    run_ship

    success "Phase 6 complete"
}

phase_7() {
    header "Phase 7: Obsidian Vault Integration"

    run_plan "Implement Phase 7 (Obsidian Vault Integration). Tasks: create /obsidian-journal skill for daily journal + lesson extraction, wire journal-writer as post-ship phase in watcher, add context loading to read obsidian-vault/Notes before planning, implement daily journal format with issues completed and decisions and lessons and unresolved, implement notes extraction with wikilinks, implement Review/Runs test result storage."

    confirm_proceed 8
    run_cook
    run_test

    SHIP_TARGET="official"
    run_ship

    success "Phase 7 complete"
}

phase_8() {
    header "Phase 8: Operator UX & Observability"

    run_plan "Implement Phase 8 (Operator UX & Observability). Tasks: create claude-swarm status command showing active tasks and queue and results, create run history and resume index, implement task metadata layer with id and role and timestamps and status and exit reason and artifacts, create capability matrix, create searchable plan/run/review index." "medium"

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
    local start_time=$(date +%s)

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
    info "Budget per phase: \$$BUDGET_PER_PHASE"
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

        local elapsed=$(( $(date +%s) - start_time ))
        success "Phase $SINGLE_PHASE done in ${elapsed}s"
        echo "Log: $LOG_FILE"
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

    local elapsed=$(( $(date +%s) - start_time ))
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    success "BUILD COMPLETE in ${elapsed}s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
    echo ""
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
