# Check 16 — the server refuses two rows and the report does not draw them. The
# count still reads 2, so only a check on the listed lines catches it.
#
# Reddens: imports: "the report reads created 2 / rejected 2 and lists lines 4 and 5"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          {result.rowErrors.length > 0 && ('
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '          {false && result.rowErrors.length > 0 && ('))
print('BROKE check 16: the report hides the rows it refused')
