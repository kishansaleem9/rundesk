# A GUEST WHOSE SHARE OF A LIST IS REMOVED KEEPS ITS ROOM (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A guest hears a list only while it is theirs to read (`guest-reach.ts`), and
# the sweep asks that again. Drop the guest's reach from the list rule and a
# guest whose share of a list was removed keeps hearing it (and so does a
# member lowered to guest, of a list nothing shares with them).
#
# Reddens: realtime-access-ends:
#   "a guest whose share of a list is removed stops hearing the list and its task on a socket already open, while a member hears both"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "      if (!theirs) return false\n"
b = "      if (!theirs && kind === 'task') return false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-3-an-unshared-guest-keeps-the-list: a guest keeps a list’s room whatever is shared with them')
