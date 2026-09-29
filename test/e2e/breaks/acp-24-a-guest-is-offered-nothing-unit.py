# A GUEST ASSIGNING THEMSELF IS OFFERED NOTHING (`ledger-rows/row-850`): the guest rule, meant for a colleague's list, takes their own with it.
# Reddens: unit: use-priorities.test.ts "a guest assigning themself is still offered their own"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  if (opts.assigneeId !== opts.currentUserId && opts.viewerRole === 'guest') return false\n"
b = "  if (opts.viewerRole === 'guest') return false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-24-a-guest-is-offered-nothing-unit: a guest is offered nothing, their own list included')
