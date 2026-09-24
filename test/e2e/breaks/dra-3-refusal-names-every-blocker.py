# THE REFUSAL NAMING EVERY BLOCKER, as it did: a hidden task's title and id to whoever tries to close.
# Reddens: dependency-read-access: "closing a task blocked by tasks the member may not open is still refused, and the refusal names only the blocker they may open"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          const named = blockers.filter((b) => seen.has(b.id)).map((b) => `${b.title} (${b.id})`)\n'
b = '          const named = blockers.map((b) => `${b.title} (${b.id})`)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dra-3-refusal-names-every-blocker: applied")
