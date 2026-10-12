# A MONTH IS THIRTY DAYS FROM ITS START.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: unit: credits.test.ts "the month is the calendar month, in UTC, and renews on the 1st"
#
# The renewal is counted in days, not months.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/credits.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const renewsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))",
     "  const renewsAt = new Date(start.getTime() + 30 * 86_400_000)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-u2-thirty-day-months: A MONTH IS THIRTY DAYS FROM ITS START.')
