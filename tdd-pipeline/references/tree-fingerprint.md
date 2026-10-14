# Working-tree fingerprint (`receipt.tree`)

The pipeline runs before the commit, so at `/ship` time HEAD still equals `receipt.sha` and the
source is dirty. An edit made AFTER the last verified run looks exactly the same. The fingerprint
tells them apart: build-coordinator stamps it into the receipt, `/ship` recomputes it and compares.

Run these as plain commands, one call each, pasting the literal path from the first into the
rest. Chained with `&&` and command substitution, a session isolated in a worktree refuses it as too complex
to verify.

```bash
git rev-parse --git-path index                  # the real index, e.g. .git/worktrees/X/index
cp <that index> <scratch>/fp-index              # any temp dir; never the real index
GIT_INDEX_FILE=<scratch>/fp-index git add -A -- ':/' ':(top,exclude)tasks'
GIT_INDEX_FILE=<scratch>/fp-index git write-tree
rm <scratch>/fp-index
```

It prints one tree id covering every tracked and untracked, non-ignored file, from any directory
in the repo. It works on a throwaway copy of the index, so the real staging area is untouched.
`tasks/` is excluded because plans, receipts and notes change between the run and the ship
without changing what was verified.
