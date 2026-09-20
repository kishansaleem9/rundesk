# Check 2 — an undrawn source with no reason. 'Record decisions as decisions':
# an absence WITH a reason is a different row from an absence without one.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "      'A Slack export is conversation JSON. There are no task rows in it to map.',"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      'Not yet.',"))
print("BROKE check 2: Slack's absence no longer says why")
