# The pad refuses to draw what the server holds: the value stores, round-trips,
# and renders as an empty box. The mirror defect, seen from the reader.
# Reddens: custom-field-types: "the signature row draws the two strokes the server holds"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '    .filter((points) => points.length >= 2)\n'
b = '    .filter((points) => points.length >= 20)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: stored signature strokes are no longer drawn.')
