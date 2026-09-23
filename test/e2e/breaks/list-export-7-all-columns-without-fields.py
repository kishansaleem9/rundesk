# "ALL COLUMNS" LEAVES THE CUSTOM FIELDS OUT.
# Reddens: list-export: "and All columns carries every custom field of the list"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      mode === 'all' ? null : mode === 'visible' ?"
b = "      mode === 'all' ? [] : mode === 'visible' ?"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-export-7-all-columns-without-fields: applied")
