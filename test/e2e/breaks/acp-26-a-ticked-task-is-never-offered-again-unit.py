# A TASK TICKED OFF YESTERDAY IS NEVER OFFERED AGAIN (`ledger-rows/row-850`): a done row counts as "already there".
# Reddens: unit: use-priorities.test.ts "a task they have ticked off may be offered again"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  return !(opts.theirs ?? []).some((p) => p.taskId === opts.taskId && !p.doneAt)\n"
b = "  return !(opts.theirs ?? []).some((p) => p.taskId === opts.taskId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-26-a-ticked-task-is-never-offered-again-unit: a finished row blocks the offer')
