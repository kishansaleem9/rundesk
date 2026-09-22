# Drop the self-assignment guard, so assigning yourself a task notifies you
# about your own action. `notification-gaps.mjs` pins the rule in words — "a
# notification telling you what you just did is noise you cannot react to" —
# and video1-acceptance now depends on it from the other side: its seed has to
# come from the PEER precisely because this account cannot notify itself. With
# the guard gone, the fixture would appear to work for the wrong reason.
#
# IT CAME BACK GREEN, AND THE CLAIM WAS THE REASON. It quoted
# "reacting to my own comment added N notification(s) for me" — which is a
# TEMPLATE LITERAL in the suite, `added ${selfAfter - selfBefore}
# notification(s)`, so no run could ever print that sentence and no log could
# be searched for it. Worse, that check is about COMMENT REACTIONS and this
# patch changes ASSIGNMENT, so even a matchable claim would have named the
# wrong check.
#
# And underneath both: `notification-gaps` assigned the task to MYSELF and only
# ever looked at the TEAMMATE's inbox. The rule this patch breaks — the actor is
# not news to the actor — was stated in the suite's header, checked for
# comments, and never checked for assignment. 7 passed, 0 failed on a patch that
# does exactly what the header forbids.
#
# The check now exists and this names it.
#
# Reddens: notification-gaps: "and assigning it to myself tells ME nothing — the actor is not news to the actor"
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
