#!/usr/bin/env bash
# One-off: point GitHub Pages at the release workflow (build_type=workflow).
# Run on a host where `gh` is logged in with admin rights on the repo; the
# sandbox token deliberately lacks the Pages permission.
set -euo pipefail

repo="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"

if gh api "repos/$repo/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/$repo/pages" -f build_type=workflow >/dev/null
  echo "Updated GitHub Pages for $repo to deploy from GitHub Actions."
else
  gh api -X POST "repos/$repo/pages" -f build_type=workflow >/dev/null
  echo "Enabled GitHub Pages for $repo, deploying from GitHub Actions."
fi

gh api "repos/$repo/pages" --jq '"Site URL: \(.html_url)"'
