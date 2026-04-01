#!/usr/bin/env bash
# Setup GitHub labels for claude-swarm automation workflow
# Usage: ./scripts/setup-labels.sh [owner/repo]

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

echo "Setting up labels for: $REPO"

gh label create "ready_for_dev" --repo "$REPO" --color "0E8A16" --description "Approved by owner, ready for automation" --force
gh label create "shipped" --repo "$REPO" --color "0075CA" --description "PR created by automation" --force
gh label create "verified" --repo "$REPO" --color "6F42C1" --description "Independently verified PASS" --force
gh label create "needs_refix" --repo "$REPO" --color "D93F0B" --description "Verification failed, needs another fix" --force
gh label create "hard" --repo "$REPO" --color "E4E669" --description "Route to opus model" --force
gh label create "frontend" --repo "$REPO" --color "0E6EB8" --description "Trigger design review flow" --force
gh label create "bug" --repo "$REPO" --color "D73A4A" --description "Route to debug-flow" --force
gh label create "feature" --repo "$REPO" --color "A2EEEF" --description "Route to ship-flow" --force
gh label create "docs" --repo "$REPO" --color "CCCCCC" --description "Route to ship-flow --no-test" --force
gh label create "chore" --repo "$REPO" --color "EDEDED" --description "Route to ship-flow --no-test" --force

echo "Labels configured successfully."
