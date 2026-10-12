# The server stops refusing the Team rollup: the paywall becomes a <div>.
# Reddens: "the blocked workspace is refused outright" + "and the refusal says which plan refused it".
#
# Re-aimed 12 October: the plan check names who is asking now — a Free plan's
# free uses are counted per member per day. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertPlanFeature(listId, 'teamView', user.id)"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    // await this.assertPlanFeature(listId, 'teamView', user.id)"))
print('[break 1] commented out the Team-view plan assertion in tasks.controller.ts —')
print('          GET /tasks/list/:id/team now answers 200 for a Free plan.')
