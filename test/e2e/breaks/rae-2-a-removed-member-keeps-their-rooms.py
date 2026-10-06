# A MEMBER REMOVED FROM THE WORKSPACE KEEPS THEIR ROOMS AT THE ROOM PASS (`found-6-oct/an-open-socket-outlives-its-access`).
#
# The room pass first settles every room of a person no longer a member of its
# workspace, then asks the rest by the rule that let each in, whose first
# question is that membership. Let the pass (and only the pass: a subscribe
# still asks) pass somebody with no membership, both ways, and a removed
# member's socket keeps the workspace's rooms and hears them. (Re-aimed when
# the membership came to be read first, for all of a person's rooms at once.)
#
# Reddens: realtime-access-ends:
#   "a member removed from the workspace stops hearing it on a socket already open — a task made in a list, a comment on a task, a message in a public channel, a doc renamed — while a member still in it hears every one"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        if (member) continue\n', '        if (member || pair.questions.length > 0) continue\n'),
    ('    if (!membership) return false\n', '    if (!membership) return !!reads\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rae-2-a-removed-member-keeps-their-rooms: the room pass passes a socket whose person is no longer a member')
