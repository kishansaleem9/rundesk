# A GUEST IS OFFERED EVERYBODY'S PRIORITIES IN THE PRIORITY FIELD (`found-29-sep/priority-field-adds-to-nobody-else`): the server refuses each choice, after the field offered it.
# Reddens: unit: use-priorities.test.ts "a guest is offered only their own priorities there"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  if (opts.viewerRole === 'guest') return me.filter(matches)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-37-a-guest-is-offered-everybody-unit: a guest is offered everybody')
