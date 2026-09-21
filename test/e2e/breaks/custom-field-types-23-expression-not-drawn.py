# The derived number is drawn with no sign of where it came from, so nobody
# reading it can check it.
# Reddens: custom-field-types: "the formula row draws the number AND the expression it came from"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '      {expression !== \'\' && (\n        <code\n          className="block text-[10px] text-muted-foreground"\n          data-testid="custom-field-formula-expression"\n        >\n'
b = '      {expression === \'never\' && (\n        <code\n          className="block text-[10px] text-muted-foreground"\n          data-testid="custom-field-formula-expression"\n        >\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the formula expression is never drawn.')
