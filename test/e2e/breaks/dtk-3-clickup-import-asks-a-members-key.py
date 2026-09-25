# A CLICKUP IMPORT ASKS A KEY EVERY MEMBER HOLDS: a manager passes the gate.
# Reddens: data-transfer-keys: "a manager starts no spreadsheet or ClickUp import (403 each) — a member granted workspace.import passes the gate, to be told the empty request is malformed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('workspace.import')\n  @ApiOperation({\n    summary:\n      'Start a ClickUp CSV import"
b = "  @RequirePermissions('report.view.basic')\n  @ApiOperation({\n    summary:\n      'Start a ClickUp CSV import"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-3-clickup-import-asks-a-members-key: ClickUp import asks report.view.basic')
