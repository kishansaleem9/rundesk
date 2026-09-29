# NO ROW EVER SAYS WHO ADDED IT (`ledger-rows/row-850`): the one helper both lists ask answers nobody, whatever the API sent.
# Reddens: unit: use-priorities.test.ts "a row a colleague added says who added it"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  return p.addedBy && p.addedBy.id !== ownerId ? p.addedBy.displayName : null\n"
b = "  return null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-28-nobody-is-said-to-have-added-it-unit: addedByOther answers nobody')
