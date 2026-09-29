# YOUR OWN ID, THROUGH THE COLLEAGUE ROUTE, IS HELD TO A COLLEAGUE'S RULES (`ledger-rows/row-850`): a guest is refused their own list, and a typed line with them.
# Reddens: unit: people.service.test.ts "takes your own id as your own add — a guest's typed line too — and records you as its adder"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "    if (userId === caller.id) return this.addPriority(workspaceId, caller.id, input)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-22-your-own-id-takes-a-colleagues-rules-unit: your own id is no longer your own add')
