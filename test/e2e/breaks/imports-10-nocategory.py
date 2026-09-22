# Check 10 — THE CONFIDENT ZERO. Write `status` and leave `status_category` at
# its 'open' default, so an imported Done task is counted outstanding by every
# rollup, the Closed toggle and the progress ring.
#
# Reddens: imports: "category, which is the column every rollup reads"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                  // The column every rollup reads. See the header note.\n                  statusCategory: r.statusCategory,'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                  // BROKEN: status_category left at its default.'))
print('BROKE check 10: imported Done tasks are stamped open')
