# A GUEST SHAPES STATUSES AGAIN wherever their level would let them add: a space
# shared with them to edit, and its statuses are theirs to rename and delete.
# Reddens: status-write-access: "a guest given a list, or a whole space, to edit still shapes none of their statuses (403, none made) — a member makes one there"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/status-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (membership?.role === 'guest') {\n"
b = "  if (membership?.role === 'guest' && params.actorId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swa-1-guests-shape-statuses: guests shape statuses')
