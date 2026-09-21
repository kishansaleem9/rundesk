# An input appears on a field the API refuses to write. It looks exactly like the
# ones that work and can only ever produce an error.
# Reddens: custom-field-types: "and offers no editor, because the API refuses the write"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '    <div className="space-y-0.5" data-testid="custom-field-formula">\n'
b = '    <div className="space-y-0.5" data-testid="custom-field-formula">\n      <input readOnly value="" aria-hidden="true" className="hidden" />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: a formula row now carries an input.')
