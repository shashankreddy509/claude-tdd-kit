# Working-tree fingerprint (`receipt.tree`)

The pipeline runs before the commit, so at `/ship` time HEAD still equals `receipt.sha` and the
source is dirty. An edit made AFTER the last verified run looks exactly the same. The fingerprint
tells them apart: build-coordinator stamps it into the receipt, `/ship` recomputes it and compares.

```bash
idx=$(mktemp -u) && cp "$(git rev-parse --git-path index)" "$idx" \
  && GIT_INDEX_FILE=$idx git add -A -- ':/' ':(top,exclude)tasks' \
  && GIT_INDEX_FILE=$idx git write-tree; rm -f "$idx"
```

It prints one tree id covering every tracked and untracked, non-ignored file, from any directory
in the repo. It works on a throwaway copy of the index, so the real staging area is untouched.
`tasks/` is excluded because plans, receipts and notes change between the run and the ship
without changing what was verified.
