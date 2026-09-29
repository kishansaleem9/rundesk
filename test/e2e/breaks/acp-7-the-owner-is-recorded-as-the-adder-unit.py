# A TASK ADDED TO A TEAMMATE'S PRIORITIES IS RECORDED AS ADDED BY THE TEAMMATE (`ledger-rows/row-850`).
# Reddens: unit: people.service.test.ts "writes the row onto the colleague's list, at its end, and records who added it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "    return this.insertPriority(workspaceId, userId, { taskId, title: null }, caller.id)\n"
b = "    return this.insertPriority(workspaceId, userId, { taskId, title: null }, userId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-7-the-owner-is-recorded-as-the-adder-unit: a colleague\'s add records the owner as its adder')
