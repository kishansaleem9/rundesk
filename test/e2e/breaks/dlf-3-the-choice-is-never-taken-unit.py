# THE CHOSEN LIST IS NEVER TAKEN, EVEN WHEN THE GATE LETS THE TASK IN.
# Reddens: unit: default-list.test.ts "takes the chosen list when the gate lets the task in"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          await this.assertCanCreateTaskIn(chosen, actorId)\n          return chosen\n'
b = '          await this.assertCanCreateTaskIn(chosen, actorId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dlf-3-the-choice-is-never-taken-unit: the chosen list is never taken')
