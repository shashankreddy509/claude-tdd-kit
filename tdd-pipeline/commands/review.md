Run a full code review using the code-review-coordinator agent.

The coordinator detects the stack from the diff and spawns security and code-quality
specialists always, plus money-logic, concurrency, memory, and language-specific
reviewers when the changed code warrants them.

Context: resolve `<default>` per `references/git-host.md`, then give the coordinator
`git diff --name-only` and `git diff` of `$(git merge-base HEAD origin/<default>)...HEAD`.
No merge-base, or the diff is empty → **STOP**: "Nothing to review against origin/<default>".
Never report a clean review of an empty diff.

$ARGUMENTS
