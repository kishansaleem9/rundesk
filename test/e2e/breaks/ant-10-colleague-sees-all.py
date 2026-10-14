# EVERY VISIT OF THE WORKSPACE IS LISTED TO EVERYBODY.
# (`commit-log/log-39863ff-1`)
#
# The panel lists the workspace's visits rather than the reader's: a colleague
# sees which meetings somebody else's notetaker sat in, and their links.
#
# Reddens: ai-notetaker: "a person’s visits and calendars are theirs: a colleague sees none of them, and cannot call one back"
import io
p = '/home/user/rundesk/apps/api/src/modules/notetaker/notetaker.service.ts'
a = "      .where(and(eq(notetakerBots.workspaceId, workspaceId), eq(notetakerBots.userId, userId)))\n      .orderBy(desc(notetakerBots.createdAt))"
b = "      .where(and(eq(notetakerBots.workspaceId, workspaceId)))\n      .orderBy(desc(notetakerBots.createdAt))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker.service.ts: the panel lists every visit of the workspace.')
