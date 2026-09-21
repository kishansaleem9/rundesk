# The remove button sends the list back unchanged: the row disappears for a moment
# and the server never hears about it.
# Reddens: custom-field-types: "and removing a related task writes through — the server holds no ids afterwards"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '            onClick={() => onCommit(value.filter((v) => v !== id))}\n'
b = '            onClick={() => onCommit(value)}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: removing a related task changes nothing.')
