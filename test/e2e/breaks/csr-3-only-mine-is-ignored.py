# A SYNC OF ONLY ITS OWNER'S TASKS TAKES EVERY TASK THERE.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a sync of only the tasks assigned to its owner takes a task once they are assigned it, and gives it up when they are not"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          if (rule.assignedOnly && !assignees.has(rule.userId)) continue\n',
     '          // BROKEN: only-mine is ignored\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-3-only-mine-is-ignored: only mine is ignored')
