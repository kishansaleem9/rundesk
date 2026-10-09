# AN ARCHIVED TASK STAYS LISTED IN ITS SECTION.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "an archived task drops off its section, and one in the trash is not put in, saying so"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('readable.has(p.taskId) && !p.isArchived && !p.deletedAt)',
     'readable.has(p.taskId) && !p.deletedAt) // BROKEN: archived stay'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-4-archived-tasks-stay-listed: archived tasks stay listed')
