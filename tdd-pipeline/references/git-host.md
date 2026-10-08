# Git host resolution

Every command that needs the default branch or a PR routes through this file. Never assume
`main`, and never assume GitHub.

## Default branch

```bash
git symbolic-ref -q --short refs/remotes/origin/HEAD | sed 's|^origin/||' | grep . \
  || git ls-remote --symref origin HEAD | awk '/^ref:/{sub("refs/heads/","",$2); print $2; exit}'
```

The `grep .` is load-bearing: `sed` exits 0 on empty input, so without it the fallback never
runs. Empty output from both → **STOP** and ask the user for the base branch.

## Host probe

`gh repo view --json url -q .url` succeeds → **GitHub path** (use `gh`). Anything else (not
GitHub, `gh` missing or unauthenticated) → **manual path**.

## Manual path

**Opening the PR/MR.** After `git push -u origin <branch>`, relay the create-PR/MR link the push
output printed. None printed → derive the web URL from `git remote get-url origin`
(`git@h:o/r.git` or `https://h/o/r.git` → `https://h/o/r`) and print:

| Host | URL |
|---|---|
| github.com | `<web>/compare/<default>...<branch>?expand=1` |
| GitLab | `<web>/-/merge_requests/new?merge_request[source_branch]=<branch>&merge_request[target_branch]=<default>` |
| Bitbucket | `<web>/pull-requests/new?source=<branch>&dest=<default>` |
| other | `<web>` + "open a PR from `<branch>` into `<default>`" |

**Merge confirmation.** AskUserQuestion: "Merged `<branch>` into `<default>`?" Supporting
evidence:

```bash
git fetch origin <default> -q && git merge-base --is-ancestor <branch> origin/<default>
```

False after a squash merge is expected, NOT a blocker — the user's answer decides.
