# Drop the self-assignment guard, so assigning yourself a task notifies you
# about your own action. `notification-gaps.mjs` pins the rule in words — "a
# notification telling you what you just did is noise you cannot react to" —
# and video1-acceptance now depends on it from the other side: its seed has to
# come from the PEER precisely because this account cannot notify itself. With
# the guard gone, the fixture would appear to work for the wrong reason.
#
# Reddens: notification-gaps:
#   "reacting to my own comment added N notification(s) for me"
# and proves video1-acceptance's seed is testing a real cross-user path rather
# than any write at all.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """    // Don't notify someone they assigned themselves
    if (assigneeId !== actorId) {
      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)"""
b = """    // Don't notify someone they assigned themselves
    if (true) {
      const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId)"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: assigning yourself a task now notifies you about it.')
