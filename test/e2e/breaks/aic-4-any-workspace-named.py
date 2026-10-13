# AN ACTION IS WRITTEN FOR ANY WORKSPACE IT NAMES.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "an action naming a workspace its asker is not in is refused in words, and nothing is written"
#
# The body says which workspace; whether the asker is in it is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (!this.calendars) return refused('unavailable', CONNECTED_REFUSALS.unavailable)\n    const workspaceId = typeof args.workspaceId === 'string' ? args.workspaceId : ''\n    if (!isUuid(workspaceId) || !(await this.memberRole(workspaceId, userId))) return refused('no_permission', CONNECTED_REFUSALS.notMember)\n",
     "    if (!this.calendars) return refused('unavailable', CONNECTED_REFUSALS.unavailable)\n    const workspaceId = typeof args.workspaceId === 'string' ? args.workspaceId : ''\n    if (!isUuid(workspaceId)) return refused('no_permission', CONNECTED_REFUSALS.notMember)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-4-any-workspace-named: the workspace an action names is not asked')
