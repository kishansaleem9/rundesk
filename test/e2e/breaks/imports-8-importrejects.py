# Check 8 — stop refusing the row with no name: let it through with an empty
# title. The report still says 2 rejected while three tasks appear.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!title) {'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "  if (title === '\\u0000') {"))
print('BROKE check 8: a row with no task name is imported anyway')
