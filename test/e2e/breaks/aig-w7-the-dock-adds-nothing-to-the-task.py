# THE DOCK'S PICTURES NEVER REACH THE TASK IT WAS OPENED ON.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the Ask AI dock makes pictures too: opened by Brain² on a task, the one made is added to the task’s files, its very bytes"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      for (const file of files) await uploadTaskFile(scope.id, file)\n',
     '      for (const file of files) void file // BROKEN: nothing added\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w7-the-dock-adds-nothing-to-the-task: the dock adds nothing to the task')
