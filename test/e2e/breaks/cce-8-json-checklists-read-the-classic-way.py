# A JSON CHECKLISTS CELL READ AS THE CLASSIC FORM: one checklist of fragments, not the two it names.
# Reddens: clickup-current-export: "both of a task’s checklists, none done, and its subtasks by Parent ID — the second level under the top-level task, in its List"
import io
p = '/home/user/rundesk/packages/imports/src/grid.ts'
a = "  if (v.startsWith('{') || v.startsWith('[')) {"
b = "  if (v.startsWith('{') && v.startsWith('[')) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-8-json-checklists-read-the-classic-way: applied")
