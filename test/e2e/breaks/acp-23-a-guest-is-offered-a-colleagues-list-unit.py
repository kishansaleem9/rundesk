# A GUEST ASSIGNING A MEMBER IS OFFERED THE MEMBER'S PRIORITIES (`ledger-rows/row-850`): an offer the server refuses, every time it is taken.
# Reddens: unit: use-priorities.test.ts "a guest is not offered a colleague’s priorities — guests cannot add to them"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  if (opts.assigneeId !== opts.currentUserId && opts.viewerRole === 'guest') return false\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-23-a-guest-is-offered-a-colleagues-list-unit: a guest is offered a colleague\'s list')
