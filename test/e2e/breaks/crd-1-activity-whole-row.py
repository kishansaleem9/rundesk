# THE ACTIVITY EMBED AS IT WAS: every actor's whole account row, password hash and all.
# Reddens: credential-reads: "a member reads who acted on the task — the admin, by name — and not one private column of their account"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      with: { actor: PUBLIC_USER_WITH },\n'
b = '      with: { actor: true },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-1-activity-whole-row: applied")
