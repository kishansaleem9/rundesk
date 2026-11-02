# TASK CONTENT TAKEN AS WRITTEN: null, the two characters \n, and Quill's JSON land in descriptions.
# Reddens: clickup-current-export: "descriptions arrive as text: the export’s escaped line breaks as real ones, Quill’s as its words, and no task’s is the word null"
import io
p = '/home/user/rundesk/packages/imports/src/clickup-current-export.ts'
a = "if (column === 'task content') return clickupContent(cell)"
b = "if (column === 'task content') return cell"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-6-task-content-is-read-as-written: applied")
