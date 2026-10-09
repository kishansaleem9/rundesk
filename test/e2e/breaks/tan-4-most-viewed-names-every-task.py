# A PERSON'S MOST-VIEWED TASKS ARE NAMED TO A READER WHO CANNOT OPEN THEM.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "a person’s most-viewed tasks are named only where the reader may open them: the admin’s view of the private task is counted for the member reading, and not named to them, while the admin reading sees it named"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        eq(tasks.isArchived, false),\n        readable,\n      ))\n      .groupBy(taskViewEvents.userId, tasks.id, tasks.title)\n',
     '        eq(tasks.isArchived, false),\n        readable && undefined, // BROKEN: every task named\n      ))\n      .groupBy(taskViewEvents.userId, tasks.id, tasks.title)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-4-most-viewed-names-every-task: most viewed names every task')
