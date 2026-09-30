# THE NEXT OCCURRENCE KEEPS A START THE RULE PUT AFTER ITS DUE DATE, and `createTask` refuses it:
# on completion the task silently stops recurring.
#
# Reddens: unit: task-writes.test.ts "keeps the start its old distance before the due date where the rule would put it after, and none for a task already inverted"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      nextStart = span >= 0 ? new Date(nextDue.getTime() - span) : undefined\n',
     '      nextStart = span >= 0 ? nextStart : undefined\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-11-the-next-occurrence-starts-late-unit: the next occurrence keeps an inverted start')
