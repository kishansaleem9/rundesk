# CREDITS ARE BOUGHT IN ANY AMOUNT.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "only whoever holds billing adds credits (a member is refused, 403); credits come in packs of 10,000 (400, in words); and a server with no payment provider says so — nothing kept (read by SQL)"
#
# Any whole number of credits is a purchase.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/credits.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (typeof credits !== 'number' || !Number.isInteger(credits) || credits <= 0 || credits % CREDITS_PER_PACK !== 0) return null\n  const packs = credits / CREDITS_PER_PACK",
     "  if (typeof credits !== 'number' || !Number.isInteger(credits) || credits <= 0) return null\n  const packs = Math.ceil(credits / CREDITS_PER_PACK)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-10-any-amount: CREDITS ARE BOUGHT IN ANY AMOUNT.')
