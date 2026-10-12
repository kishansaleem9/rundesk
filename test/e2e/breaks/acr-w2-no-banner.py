# THE COMPOSER NEVER WARNS.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "at 80% of the month’s credits the workspace is warned: the composer says so and how many are left"
#   or "the composer says AI is paused, until when, and that an admin can add credits — none left of the month’s"
#
# The 80% and 100% banners are left out.
import io
p = '/home/user/rundesk/apps/web/src/components/ai-credits.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      {c.state !== 'ok' && (\n        <div\n          data-testid=\"ai-credit-banner\"",
     "      {c.state !== 'ok' && c.used < 0 && (\n        <div\n          data-testid=\"ai-credit-banner\""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w2-no-banner: THE COMPOSER NEVER WARNS.')
