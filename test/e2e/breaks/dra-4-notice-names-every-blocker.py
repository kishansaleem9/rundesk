# THE NOTICE NAMING THE BLOCKER TO EVERY RECIPIENT, as it did.
# Reddens: dependency-read-access: "the member is told their task is blocked each time, and the notice names only a blocker they may open"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          body: seesBlocker ? `Blocked by "${blocker.title}".` : \'Blocked by a task you cannot open.\',\n'
b = '          body: `Blocked by "${blocker.title}".`,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dra-4-notice-names-every-blocker: applied")
