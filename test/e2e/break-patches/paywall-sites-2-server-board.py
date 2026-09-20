# The server stops refusing the board-shaped export.
# Reddens: "the blocked workspace is refused" (board download).
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (boardShaped) await this.assertPlanFeature(listId, 'boardExport')"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    if (false) await this.assertPlanFeature(listId, 'boardExport')"))
print('[break 2] disabled the board-export plan assertion in tasks.controller.ts —')
print('          ?view=board now downloads on a Free plan.')
