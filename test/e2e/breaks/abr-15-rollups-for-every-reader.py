# A RELATIONSHIP’S ROLLUPS NAME TASKS THEIR READER MAY NOT OPEN.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a Relationship’s rollups give each related task’s value of the rolled-up field — the owner sees both clients’, and Mia, who may not open the private one, sees only the one she may"
#
# Every related task’s values are read, whoever reads.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const open = reader ? await readableTaskIds(this.db, workspaceId, reader.id, ids, reader.role) : new Set(ids)",
     "    const open = new Set(ids)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-15-rollups-for-every-reader: A RELATIONSHIP’S ROLLUPS NAME TASKS THEIR READER MAY NOT OPEN.')
