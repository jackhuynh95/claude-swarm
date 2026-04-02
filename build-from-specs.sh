#!/bin/bash
# ==============================================================================
# Script: build-from-specs.sh
# Description: Build the "claude-swarm build" CLI tool (Tool 2: Builder).
#              Implements src/commands/build/ — roadmap parser, GitHub hierarchy
#              creator, epic executor, build status, CLI wiring.
#
# Usage:
#   ./build-from-specs.sh                     # all phases sequentially
#   ./build-from-specs.sh --phase 1           # specific phase
#   ./build-from-specs.sh --from 3            # resume from phase 3
#   ./build-from-specs.sh --auto              # skip confirmations
#   ./build-from-specs.sh --budget 20         # max USD per call
#   ./build-from-specs.sh --dry-run           # preview commands
#
# Phases:
#   0 — Roadmap Generator + From-Scratch Pipeline (roadmap-generator.ts)
#   1 — Roadmap Parser (roadmap-parser.ts)
#   2 — GitHub Hierarchy Creator (github-hierarchy.ts)
#   3 — Epic Executor (epic-executor.ts)
#   4 — Build Status (build-status.ts)
#   5 — CLI Wiring (build-command.ts)
#
# Requirements:
#   - Claude CLI installed and authenticated
#   - gh CLI authenticated
#   - Run from claude-swarm repo root
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ROADMAP="$PROJECT_ROOT/docs/implement-roadmap-builder.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/build-specs-$(date +%Y%m%d-%H%M%S).log"
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

# Parse flags
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
    local budget="${4:-$BUDGET_PER_CALL}"
    local extra_flags="${5:-}"

    local flags="--model $model --effort $effort --output-format text --max-budget-usd $budget"

    if [[ "$AUTO_MODE" == "true" ]]; then
        flags="$flags --dangerously-skip-permissions"
    fi

    [[ -n "$extra_flags" ]] && flags="$flags $extra_flags"

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
        warn "No plan.md found — cooking from roadmap directly"
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
    info "Running tests..."
    run_claude "/test Run all tests and report results." "sonnet" "low" "5.00"
}

run_ship() {
    info "Committing..."
    run_claude "/ck:git cm Stage and commit all changes." "sonnet" "low" "1.00"
}

confirm_proceed() {
    local next="$1"
    if [[ "$AUTO_MODE" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    echo ""
    read -p "$(echo -e "${YELLOW}Proceed to next step? [Y/n]${NC} ")" confirm
    if [[ "${confirm:-Y}" =~ ^[Nn] ]]; then
        warn "Paused. Resume with: $0 --from $next"
        exit 0
    fi
}

# ------------------------------------------------------------------------------
# Phase definitions
# ------------------------------------------------------------------------------

phase_0() {
    header "Phase 0: Roadmap Generator + From-Scratch Pipeline"

    run_plan "Implement Phase 0 (Roadmap Generator and From-Scratch Pipeline) for claude-swarm build command. Create src/commands/build/roadmap-generator.ts. Tasks: accept topic string or @file as input, spawn Claude opus high effort to brainstorm scope and structure, output roadmap markdown with milestone and epics and issues and sub-issues following implement-roadmap format (headings plus tables plus status columns), write to docs/implement-roadmap-slug.md, support --context @file for additional background like Obsidian notes, support --epics N to control epic count, support dry-run mode. Then implement from-scratch subcommand that chains generate then init then run, passes --auto and --budget through, shows progress at each stage."

    confirm_proceed 1
    run_cook
    run_test
    run_ship

    success "Phase 0 complete"
}

phase_1() {
    header "Phase 1: Roadmap Parser"

    run_plan "Implement Phase 1 (Roadmap Parser) for claude-swarm build command. Create src/commands/build/roadmap-parser.ts. Tasks: parse milestone name from markdown heading, parse epics from Epic N headings, parse issues from table rows, parse sub-issues from indented rows, output structured JSON with milestone and epics and issues and subs. Support both implement-roadmap.md format (phase tables) and implement-roadmap-4layers.md format (epic tables). Use TypeScript with zod for validation."

    confirm_proceed 2
    run_cook
    run_test
    run_ship

    success "Phase 1 complete"
}

phase_2() {
    header "Phase 2: GitHub Hierarchy Creator"

    run_plan "Implement Phase 2 (GitHub Hierarchy Creator) for claude-swarm build command. Create src/commands/build/github-hierarchy.ts. Tasks: create milestone via gh CLI, create epic issues with epic label (watcher skips these), create child issues per epic with ready_for_dev label, link children to parent via task list in epic issue body, create sub-issues as checklist in child issue body, add labels based on type, create labels if missing, support dry-run mode. Use spawn for gh CLI calls."

    confirm_proceed 3
    run_cook
    run_test
    run_ship

    success "Phase 2 complete"
}

phase_3() {
    header "Phase 3: Epic Executor"

    run_plan "Implement Phase 3 (Epic Executor) for claude-swarm build command. Create src/commands/build/epic-executor.ts. Tasks: spawn claude -p for /ck:plan per issue with model routing (opus for plan, sonnet for cook, haiku for report), spawn claude -p for /ck:cook per issue, spawn /test after cook, spawn /ck:git cm to commit, close GitHub issue on success via gh issue close, update epic body checklist when child closes, add --max-budget-usd per call, add --permission-mode auto or --dangerously-skip-permissions, add timeout with SIGTERM then SIGKILL, resume by skipping already-closed issues."

    confirm_proceed 4
    run_cook
    run_test
    run_ship

    success "Phase 3 complete"
}

phase_4() {
    header "Phase 4: Build Status"

    run_plan "Implement Phase 4 (Build Status) for claude-swarm build command. Create src/commands/build/build-status.ts. Tasks: query milestone progress via gh milestone view, query epic issues and children via gh issue list, show progress bar per epic (closed out of total children), show overall milestone progress, show cost summary if cost-tracker data available. Use chalk for colored terminal output."

    confirm_proceed 5
    run_cook
    run_test
    run_ship

    success "Phase 4 complete"
}

phase_5() {
    header "Phase 5: CLI Wiring"

    run_plan "Implement Phase 5 (CLI Wiring) for claude-swarm build command. Create src/commands/build/build-command.ts. Wire into main CLI entry point using commander.js. Subcommands: build init @roadmap.md (parse and create hierarchy), build plan --epic N (plan all issues in epic), build cook --epic N --auto (cook all issues), build run --epic N --auto (full cycle plan cook test ship), build run --all --auto (all epics), build run --from N --auto (resume), build status (show progress). Add --dry-run and --budget flags on all subcommands."

    confirm_proceed 5
    run_cook
    run_test

    # Final phase ships to official
    info "Committing final..."
    run_claude "/ck:git cp Stage, commit and push all changes." "sonnet" "low" "1.00"

    success "Phase 5 complete"
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------

main() {
    local start_time=$(date +%s)

    info "=========================================="
    info "claude-swarm: build from specs"
    info "Roadmap: $ROADMAP"
    [[ -n "$SINGLE_PHASE" ]] && info "Phase: $SINGLE_PHASE"
    [[ -n "$FROM_PHASE" ]] && info "Resume from: Phase $FROM_PHASE"
    [[ "$DRY_RUN" == "true" ]] && info "Mode: dry-run"
    [[ "$AUTO_MODE" == "true" ]] && info "Mode: auto (YOLO)"
    info "Budget per call: \$$BUDGET_PER_CALL"
    info "=========================================="

    cd "$PROJECT_ROOT"

    # Pre-flight
    command -v claude &>/dev/null || { error "Claude CLI not found"; exit 1; }
    command -v gh &>/dev/null || { error "GitHub CLI not found"; exit 1; }
    [[ -f "$ROADMAP" ]] || { error "Roadmap not found: $ROADMAP"; exit 1; }

    # Single phase
    if [[ -n "$SINGLE_PHASE" ]]; then
        case "$SINGLE_PHASE" in
            0) phase_0 ;;
            1) phase_1 ;;
            2) phase_2 ;;
            3) phase_3 ;;
            4) phase_4 ;;
            5) phase_5 ;;
            *) error "Unknown phase: $SINGLE_PHASE (valid: 0-5)"; exit 1 ;;
        esac

        local elapsed=$(( $(date +%s) - start_time ))
        success "Phase $SINGLE_PHASE done in ${elapsed}s"
        echo "Log: $LOG_FILE"
        return
    fi

    # Sequential
    local start=0
    [[ -n "$FROM_PHASE" ]] && start="$FROM_PHASE"

    local phases=(phase_0 phase_1 phase_2 phase_3 phase_4 phase_5)
    local nums=(0 1 2 3 4 5)

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
    success "BUILD FROM SPECS COMPLETE in ${elapsed}s"
    echo -e "${CYAN}══════════════════════════════════════════${NC}"
    echo "Log: $LOG_FILE"
    echo ""
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
