# THE VIEW'S COLUMNS IN THE EXPORT'S OWN ORDER, not the view's.
# Reddens: list-export: "Visible columns exports the fields the view names, in its order — and nothing it hid"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '            ? opts.fields.map((k) => COLUMNS.find((c) => c.key === k)).filter((c): c is (typeof COLUMNS)[number] => Boolean(c))\n'
b = '            ? COLUMNS.filter((c) => opts.fields!.includes(c.key))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-4-columns-in-catalogue-order: applied")
