# EVERY ROW ON YOUR LIST SAYS "ADDED BY" YOU (`ledger-rows/row-850`): the owner is not left out, so your own choices are labelled as if handed to you.
# Reddens: unit: use-priorities.test.ts "your own rows say nothing"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  return p.addedBy && p.addedBy.id !== ownerId ? p.addedBy.displayName : null\n"
b = "  return p.addedBy ? p.addedBy.displayName : null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-29-your-own-rows-name-you-unit: addedByOther names the owner too')
