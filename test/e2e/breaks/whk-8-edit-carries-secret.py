# AN EDIT ANSWERS WITH THE SECRET.
# Reddens: webhook-access: "and an edit answers without it"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.service.ts'
a = '    return withoutSecret(row)\n'
b = '    return row\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-8-edit-carries-secret: applied")
