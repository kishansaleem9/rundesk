# A SPREADSHEET IMPORT ASKS A KEY EVERY MEMBER HOLDS: a manager passes the gate.
# Reddens: data-transfer-keys: "a manager starts no spreadsheet or ClickUp import (403 each) — a member granted workspace.import passes the gate, to be told the empty request is malformed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.controller.ts'
s = io.open(p, encoding='utf-8').read()
# The start route's key, not the preview's (`found-6-oct/import-previews-tell-what-private-places-hold` asks it of both).
a = "  @RequirePermissions('workspace.import')\n  @ApiOperation({ summary: 'Start a spreadsheet import"
b = "  @RequirePermissions('report.view.basic')\n  @ApiOperation({ summary: 'Start a spreadsheet import"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-2-sheet-import-asks-a-members-key: spreadsheet import asks report.view.basic')
