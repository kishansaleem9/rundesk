# SPENT, A FEATURE IS REFUSED EVEN TO A MEMBER WHO ALREADY USED IT TODAY.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "with its sixty uses spent, Team View is refused in words — nothing made with it lost — to a member with no use today, and not to one who already has today’s"
#   or "Pro has sixty free uses of Team View, each a member’s day with it: Mia opening it twice takes one, Olga another"
#   or "the Team View says how many of its free uses are left"
#
# Measured 12 October: the last 2 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Today’s use is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (already) return\n",
     "      if (already && feature.length < 0) return\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-13-spent-for-everyone: SPENT, A FEATURE IS REFUSED EVEN TO A MEMBER WHO ALREADY USED IT TODAY.')
