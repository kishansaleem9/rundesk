# The server stops refusing the board-shaped export.
# THE CLAIM WAS AIMED AT THE WRONG CHECK.
# Its claim, "the blocked workspace is refused", was a PREFIX of the TEAM
# export’s sentence sixteen lines above the board one — so it matched a passing
# check and this patch read as unproven. Two checks whose sentences overlap
# cannot be told apart in a log and neither can be named by a patch; the board
# one says "refused the board too" now.
#
# Reddens: paywall-sites: "the blocked workspace is refused the board too"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (boardShaped) await this.assertPlanFeature(listId, 'boardExport')"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    if (false) await this.assertPlanFeature(listId, 'boardExport')"))
print('[break 2] disabled the board-export plan assertion in tasks.controller.ts —')
print('          ?view=board now downloads on a Free plan.')
