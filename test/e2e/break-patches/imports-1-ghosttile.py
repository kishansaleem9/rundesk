# Check 1 — THE ANTI-FACADE CHECK. Rename the Wrike preset to 'basecamp', so the
# picker draws a Basecamp tile with no importer behind it: exactly the ten-tiles
# facade this row was built to avoid.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "    key: 'wrike',"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    key: 'basecamp',"))
print('BROKE check 1: the picker now draws a Basecamp tile that no parser backs')
