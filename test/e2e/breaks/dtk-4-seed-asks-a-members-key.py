# SEEDING SAMPLE DATA ASKS A KEY EVERY MEMBER HOLDS: a manager passes the gate.
# Reddens: data-transfer-keys: "a manager seeds no sample data (403) — a member granted workspace.import passes the gate, to be told the workspace is not empty"
import io
p = '/home/user/rundesk/apps/api/src/modules/sample-data/sample-data.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "@RequirePermissions('workspace.import')\n"
b = "@RequirePermissions('report.view.basic')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-4-seed-asks-a-members-key: seeding asks report.view.basic')
