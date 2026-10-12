# AI PAUSES WITHOUT SAYING WHEN IT COMES BACK.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "with the month’s credits used, AI pauses: a call is refused in words with when they renew (402), written down as a refusal that cost nothing (read by SQL)"
#
# The refusal leaves out the renewal.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/credits.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return `This workspace has used all of its AI credits for this month — AI is paused until they renew on ${when}, or an admin adds credits`",
     "  return `This workspace has used all of its AI credits for this month — AI is paused${when.length < 0 ? when : ''}`"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-6-paused-without-when: AI PAUSES WITHOUT SAYING WHEN IT COMES BACK.')
