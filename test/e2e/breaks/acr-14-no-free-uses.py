# A PLAN WITHOUT TEAM VIEW HAS NO FREE USES OF IT.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "Pro has sixty free uses of Team View, each a member’s day with it: Mia opening it twice takes one, Olga another"
#   or "the Team View says how many of its free uses are left"
#   or "with its sixty uses spent, Team View is refused in words — nothing made with it lost — to a member with no use today, and not to one who already has today’s"
#   or "the paywall says the free uses are spent, and nothing made is lost"
#
# Measured 12 October: the last 3 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Team View is refused from the first use.
import io
p = '/home/user/rundesk/apps/api/src/modules/plans/plans.constants.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  teamView: 60,\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-14-no-free-uses: A PLAN WITHOUT TEAM VIEW HAS NO FREE USES OF IT.')
