# THE CHART’S LIMIT LINE IS DRAWN AT NOTHING.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "the credits card shows the month’s credits, used and bought, each day’s running total against the limit line, what each kind of AI used, and Add credits to the owner"
#
# The line is the allowance’s, at zero.
import io
p = '/home/user/rundesk/apps/web/src/components/ai-credits.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          <CreditsChart days={c.days} allowance={c.allowance ?? 0} />",
     "          <CreditsChart days={c.days} allowance={0} />"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w3-the-limit-at-nothing: THE CHART’S LIMIT LINE IS DRAWN AT NOTHING.')
