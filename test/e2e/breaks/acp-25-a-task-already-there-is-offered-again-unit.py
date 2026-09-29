# A TASK ALREADY OPEN ON THE ASSIGNEE'S LIST IS OFFERED AGAIN (`ledger-rows/row-850`): the list read after assigning decides nothing.
# Reddens: unit: use-priorities.test.ts "a task already open on their list is not offered again"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  return !(opts.theirs ?? []).some((p) => p.taskId === opts.taskId && !p.doneAt)\n"
b = "  return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-25-a-task-already-there-is-offered-again-unit: the offer ignores the list it read')
