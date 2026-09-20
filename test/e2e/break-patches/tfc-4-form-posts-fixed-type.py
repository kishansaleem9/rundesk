# The form renders the whole picker and posts `text` whatever was chosen: the
# control looks complete and can only ever say one thing.
# Reddens: task-field-create — "submitting the form writes the field the form described"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        createField.mutate({
          name: newName.trim(),
          type: newType,"""
b = """        createField.mutate({
          name: newName.trim(),
          type: 'text',"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the create form posts type `text` regardless of what the picker shows.")
