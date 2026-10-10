#!/usr/bin/env bash
# standup.sh — emit RAW facts for the /standup sweep (git + gh + tag-diff).
# Report-only, read-only. The model formats these + adds the Jira/JQL source.
# bash 3.2 / macOS compatible. No mapfile. Degrades gracefully; never crashes.
#
# app-code scope: the deploy gap lists only app-code commits/files. Default: every
# changed file EXCEPT docs, tests and CI config; restrict to given prefixes with
# --app-paths "a b c" or STANDUP_APP_PATHS="a b c".

set -u

# --- args / config -----------------------------------------------------------
APP_PATHS="${STANDUP_APP_PATHS:-}"
NON_APP='^(docs/|test/|tests/|__tests__/|\.github/|\.gitlab-ci\.yml$|\.circleci/)|\.md$|Tests/|_test\.|\.test\.|\.spec\.'

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-paths)
      APP_PATHS="${2:-}"; shift 2 || shift ;;
    --app-paths=*)
      APP_PATHS="${1#*=}"; shift ;;
    -h|--help)
      echo "usage: standup.sh [--app-paths \"app/ src/\"]"; exit 0 ;;
    *)
      shift ;;
  esac
done

# Are we even in a git repo?
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "== standup facts =="
  echo "NOTE: not inside a git repository."
  exit 0
fi

REPO="$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")"

# Default branch — never assume main. Local origin/HEAD first, else ask the remote.
DEFAULT="$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)"
DEFAULT="${DEFAULT#origin/}"
[ -z "$DEFAULT" ] && DEFAULT="$(git ls-remote --symref origin HEAD 2>/dev/null \
  | awk '/^ref:/{sub("refs/heads/","",$2); print $2; exit}')"

# Best-effort refresh of remote refs + tags (read-only). Silent on failure.
git fetch origin ${DEFAULT:+"$DEFAULT"} --tags -q >/dev/null 2>&1 || true

echo "== standup facts =="
echo "repo: ${REPO}"
echo "default_branch: ${DEFAULT:-(unknown)}"

# --- 1. git working state ----------------------------------------------------
BRANCH="$(git branch --show-current 2>/dev/null)"
[ -z "$BRANCH" ] && BRANCH="(detached)"
echo "branch: ${BRANCH}"

STATUS="$(git status --short 2>/dev/null)"
if [ -z "$STATUS" ]; then
  echo "dirty_count: 0"
  echo "dirty_files:"
else
  DIRTY_COUNT="$(printf '%s\n' "$STATUS" | grep -c '.')"
  echo "dirty_count: ${DIRTY_COUNT}"
  echo "dirty_files:"
  printf '%s\n' "$STATUS" | sed 's/^/  /'
fi

# ahead/behind vs upstream (only if an upstream is configured)
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)"
if [ -n "$UPSTREAM" ]; then
  set -- $(git rev-list --left-right --count "${UPSTREAM}"...HEAD 2>/dev/null)
  BEHIND="${1:-0}"; AHEAD="${2:-0}"
  echo "upstream: ${UPSTREAM}"
  echo "ahead: ${AHEAD}"
  echo "behind: ${BEHIND}"
else
  echo "upstream: (none)"
fi

# --- 2. open PRs (gh) --------------------------------------------------------
echo "prs:"
if ! command -v gh >/dev/null 2>&1; then
  echo "  NOTE: gh not installed — skipping open-PR sweep."
elif ! gh auth status >/dev/null 2>&1; then
  echo "  NOTE: gh not authenticated — skipping open-PR sweep."
else
  if ! PRS="$(gh pr list --state open --json number,title,headRefName \
           -q '.[] | "  #\(.number) \(.title) [\(.headRefName)]"' 2>/dev/null)"; then
    echo "  (PR list unavailable: gh failed or remote is not GitHub)"
  elif [ -z "$PRS" ]; then
    echo "  (none open)"
  else
    printf '%s\n' "$PRS"
  fi
fi

# --- 3. deploy gap (latest tag vs origin/<default>, app-code only) -----------
echo "deploy_gap:"
LATEST_TAG="$(git tag -l 'v*' 2>/dev/null | sort -V | tail -1)"
if [ -z "$LATEST_TAG" ]; then
  LATEST_TAG="$(git describe --tags --abbrev=0 2>/dev/null)"
fi

if [ -z "$LATEST_TAG" ]; then
  echo "  latest_tag: (none)"
  echo "  NOTE: no tags found — cannot compute deploy gap."
else
  echo "  latest_tag: ${LATEST_TAG}"
  BASE="origin/$DEFAULT"
  if [ -z "$DEFAULT" ] || ! git rev-parse --verify -q "$BASE" >/dev/null 2>&1; then
    echo "  NOTE: origin/${DEFAULT:-<default branch>} not found — cannot compute deploy gap."
  else
    # app-code file changes since the tag (content, not PR title)
    CHANGED_ALL="$(git diff --name-only "${LATEST_TAG}..${BASE}" 2>/dev/null)"
    APP_CHANGED=""
    if [ -n "$APP_PATHS" ]; then
      for p in $APP_PATHS; do
        MATCH="$(printf '%s\n' "$CHANGED_ALL" | grep "^${p}" 2>/dev/null)"
        [ -n "$MATCH" ] && APP_CHANGED="${APP_CHANGED}${MATCH}
"
      done
    else
      APP_CHANGED="$(printf '%s\n' "$CHANGED_ALL" | grep -vE "$NON_APP")"
    fi
    APP_CHANGED="$(printf '%s' "$APP_CHANGED" | grep '.' | sort -u)"

    echo "  app_paths: ${APP_PATHS:-(all except docs/tests/CI)}"
    if [ -z "$APP_CHANGED" ]; then
      TOTAL="$(printf '%s\n' "$CHANGED_ALL" | grep -c '.')"
      echo "  status: NO-OP (no app-code changes; ${TOTAL} non-app files changed)"
    else
      echo "  status: PENDING (app-code changed since ${LATEST_TAG})"
      echo "  app_files_changed:"
      printf '%s\n' "$APP_CHANGED" | sed 's/^/    /'
      echo "  app_commits:"
      git log --oneline "${LATEST_TAG}..${BASE}" -- $APP_CHANGED 2>/dev/null \
        | sed 's/^/    /'
    fi
  fi
fi

echo "== end facts =="
exit 0
