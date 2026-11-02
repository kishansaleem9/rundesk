# THE CURRENT EXPORT MAPPED AS THE CLASSIC ONE: Home Location left out, List Name used to place tasks.
# Reddens: clickup-current-export: "the export maps with no clicks — Home Location to List location, List Name left out, Task Content to the description — and the grid names the one assignee who is not a member"
import io
p = '/home/user/rundesk/packages/imports/src/automap.ts'
a = 'const current = isClickUpCurrentExport(headers) ? CLICKUP_CURRENT_EXPORT : {}'
b = 'const current = isClickUpCurrentExport([]) ? CLICKUP_CURRENT_EXPORT : {}'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-2-the-current-export-is-not-recognised: applied")
