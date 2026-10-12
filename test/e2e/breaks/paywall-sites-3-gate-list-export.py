# THE ONE THAT MATTERS MOST: the gate spreads to the FREE list export.
# `[10:49]` "agar aap ke paas premium nahi to aap LIST VIEW download karo" —
# this is the sentence being broken, and the board half would still pass.
# Reddens: paywall-sites: "the list download is still free on the blocked plan"
#   or "and it is the whole list, not an empty file with a 200 on it"
#   or "asking for view=list by name is free too"
#   and in list-export: "a Free plan still downloads the list it is looking at"
#
# Re-aimed 12 October: the plan check names who is asking now — a Free plan's
# free uses are counted per member per day. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (boardShaped) await this.assertPlanFeature(listId, 'boardExport', user.id)"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    await this.assertPlanFeature(listId, 'boardExport', user.id)"))
print('[break 3] widened the export gate to EVERY export in tasks.controller.ts —')
print('          the free list download is now paid too.')
