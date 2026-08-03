Run a full code review using the code-review-coordinator agent.

The coordinator detects the stack from the diff and spawns security and code-quality
specialists always, plus money-logic, concurrency, memory, and language-specific
reviewers when the changed code warrants them.

Context:
- Changed files: `!git diff --name-only $(git merge-base HEAD origin/main)...HEAD`
- Full diff: `!git diff $(git merge-base HEAD origin/main)...HEAD`

$ARGUMENTS
