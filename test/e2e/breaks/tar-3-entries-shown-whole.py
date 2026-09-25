# EVERY ENTRY IS SHOWN WHOLE: the delegate is shown the private project’s name and note.
# Reddens: time-approval-rule: "the delegate is shown the submitter’s three hours and both entries, but neither the name nor the note of the private project’s — the manager, who may open it, is shown its name"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        readable.has(row.taskId)\n'
b = '        readable.has(row.taskId) || true\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-3-entries-shown-whole: no entry is masked')
