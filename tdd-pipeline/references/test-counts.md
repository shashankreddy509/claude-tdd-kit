# How many tests ran (the count line)

An exit code is not a result: a runner can exit 0 having run nothing. test-runner and
build-coordinator's verify-red step read the count from the output saved to a file. No count
found, or a count of zero, means nothing ran: never a pass.

| Runner | Where the count is |
|---|---|
| xcodebuild | `Executed N tests, with M failures`. `** TEST SUCCEEDED **` alone is not a count |
| Swift Testing | `Test run with N tests` |
| pytest | final line `N passed, M failed` (`no tests ran` = zero) |
| jest / vitest | `Tests: N passed, M failed, T total` |
| dotnet test | `Passed!` / `Failed!` line with `Total: N` |
| Gradle | prints no count on success: read `tests=` and `failures=` from `build/test-results/**/TEST-*.xml` under the folder `TEST_CMD` ran in. No XML written = zero |
| go test | one `ok` / `FAIL` line per package; `[no test files]` or `testing: warning: no tests to run` = zero for that package. Every package zero = nothing ran. For a number, re-run with `-v` and count `--- PASS` / `--- FAIL` |
| Other | the runner's own summary line; none printed = state that and treat as zero |
