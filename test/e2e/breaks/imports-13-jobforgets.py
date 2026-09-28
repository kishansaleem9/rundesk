# Check 13 — the job row forgets which lines were refused. `rejected_count` still
# says 2, so only a check that reads row_errors out of Postgres catches it.
#
# Reddens: imports: "\\n▶ the job row records the refusals, by line, with the reason"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          rowErrors: summary.rowErrors,\n          result: summary as unknown as Record<string, unknown>,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '          rowErrors: [],\n          result: summary as unknown as Record<string, unknown>,'))
print('BROKE check 13: the job row no longer records which lines were refused')
