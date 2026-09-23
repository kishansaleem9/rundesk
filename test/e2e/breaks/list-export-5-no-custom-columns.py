# NO CUSTOM FIELD IS EVER A COLUMN, as it never was.
# Reddens: list-export: "a custom field the view shows is a column of its own, a dropdown written as its label"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!this.customFields || rows.length === 0 || (ids && ids.length === 0)) return []\n'
b = '    if (!this.customFields || rows.length >= 0 || (ids && ids.length === 0)) return []\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-5-no-custom-columns: applied")
