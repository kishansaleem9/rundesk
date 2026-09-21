# THE ONE THAT MATTERS MOST: the gate spreads to the FREE list export.
# `[10:49]` "agar aap ke paas premium nahi to aap LIST VIEW download karo" —
# this is the sentence being broken, and the board half would still pass.
# Reddens: "the list download is still free on the blocked plan",
#          "it is the whole list, not an empty file",
#          "asking for view=list by name is free too",
#          and in list-export.mjs "a Free plan still downloads the list".
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (boardShaped) await this.assertPlanFeature(listId, 'boardExport')"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    await this.assertPlanFeature(listId, 'boardExport')"))
print('[break 3] widened the export gate to EVERY export in tasks.controller.ts —')
print('          the free list download is now paid too.')
