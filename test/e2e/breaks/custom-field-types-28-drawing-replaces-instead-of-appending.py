# Every new stroke throws away the ones before it, so a signature can only ever be
# one stroke long and the loss is invisible while you are drawing.
# Reddens: custom-field-types: "and drawing on it appends a stroke the server then holds"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    const next = value === '' ? live.join(' ') : `${value};${live.join(' ')}`\n"
b = "    const next = live.join(' ')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: drawing replaces the signature instead of appending to it.')
