Run a full code review using the code-review-coordinator agent.

The coordinator will spawn security, memory, and code quality specialists in parallel.

Context:
- Platform: Android / Kotlin
- Changed files: `!git diff --name-only $(git merge-base HEAD origin/main)...HEAD`
- Full diff: `!git diff $(git merge-base HEAD origin/main)...HEAD`

$ARGUMENTS