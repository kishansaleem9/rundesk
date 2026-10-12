# EVERY CALL TO A METERED FEATURE IS A USE.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "Pro has sixty free uses of Team View, each a member’s day with it: Mia opening it twice takes one, Olga another"
#   or "the Team View says how many of its free uses are left"
#   or "with its sixty uses spent, Team View is refused in words — nothing made with it lost — to a member with no use today, and not to one who already has today’s"
#
# Measured 12 October: the last 2 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# A use is not a member’s day: each call takes one.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        select ${workspaceId}, ${feature}, ${userId}, ${day}::date",
     "        select ${workspaceId}, ${feature}, ${userId}, (${day}::date - (random() * 100000)::int)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-11-every-call-a-use: EVERY CALL TO A METERED FEATURE IS A USE.')
