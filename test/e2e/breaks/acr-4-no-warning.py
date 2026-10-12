# THE WORKSPACE IS NEVER WARNED.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "at 80% of the month’s credits the workspace is warned: the composer says so and how many are left"
#
# The warning waits for twice the month’s credits.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/credits.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("used >= allowance * WARN_AT ? 'warning' : 'ok'",
     "used >= allowance * WARN_AT * 2 ? 'warning' : 'ok'"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-4-no-warning: THE WORKSPACE IS NEVER WARNED.')
