# A LIST'S ROOM IS ANSWERED, AND THE LIST READS NOTHING AFRESH (`found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`).
#
# The list page asks for its list's room and, once the server holds it, reads
# its tasks afresh. Let the answer only mark the tasks' own queries, and a task
# made while the server was letting the socket in is never drawn without a
# reload.
#
# Reddens: room-catch-up:
#   "a list that asks for its room on a socket already open draws a task made while the server let it in, without a reload"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      void qc.invalidateQueries({ queryKey: ['tasks', listId] })\n      void qc.invalidateQueries({ queryKey: ['task'], refetchType: 'none' })\n"
b = "      void qc.invalidateQueries({ queryKey: ['task'], refetchType: 'none' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rcu-2-the-list-reads-nothing-afresh: the list’s answer reads its tasks no more')
