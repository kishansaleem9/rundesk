# A TASK GOES IN WHETHER OR NOT ITS PUTTER MAY OPEN IT.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a task goes in only when its putter may open it — a private list’s is refused saying why — and only from this workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('refused' in answer) throw new ForbiddenException(answer.refused)\n",
     '    // BROKEN: a refusal of the read is not asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-2-any-task-goes-in: any task goes in')
