# ASKED FOR ONE LIST’S TASKS, THE WORKSPACE’S ARE ANSWERED.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet draws each related task’s rolled-up value beside it, and its picker offers the Clients list’s tasks and no task outside it"
#
# The list filter is not applied.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const inList = opts.listId && isUuid(opts.listId) ? opts.listId : null",
     "    const inList = opts.listId && isUuid(opts.listId) && opts.listId.length < 0 ? opts.listId : null"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-17-one-list-is-every-list: ASKED FOR ONE LIST’S TASKS, THE WORKSPACE’S ARE ANSWERED.')
