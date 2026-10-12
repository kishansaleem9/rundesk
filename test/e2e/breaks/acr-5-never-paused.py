# AI NEVER PAUSES.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "with the month’s credits used, AI pauses: a call is refused in words with when they renew (402), written down as a refusal that cost nothing (read by SQL)"
#
# A spent month lets every call through.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (credits.state !== 'paused') return\n",
     "    if (credits.state !== 'paused' || credits.used >= 0) return\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-5-never-paused: AI NEVER PAUSES.')
