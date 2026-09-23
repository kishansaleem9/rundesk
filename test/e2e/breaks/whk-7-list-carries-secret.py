# THE LIST CARRIES THE SECRET AGAIN, to whoever may read it.
# Reddens: webhook-access: "the answer that makes a webhook carries its secret; the list, even the admin’s, says only that it has one"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.service.ts'
a = '    return rows.map(withoutSecret)\n'
b = '    return rows\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-7-list-carries-secret: applied")
