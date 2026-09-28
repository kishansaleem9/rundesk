# The switch and the chip agree with each other perfectly and the FILTER stops
# asking. Both controls move together, the list does not change, and every
# check about the two surfaces being one setting still passes.
# Reddens: list-customize: "+ 'the panel is a second door onto one setting, not a second setting', ) const closedGone = await waitUntil(() => closedGroup().count().then((n) => n === 0), { timeoutMs: 8000 }) chk( closedBefore === '1' && closedGone, 'and the closed task really leaves the list, off the group that held it',"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "      showClosed,\n      assignedViaIds,"
b = "      true,\n      assignedViaIds,"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('filterTasks is told showClosed=true whatever the controls say.')
