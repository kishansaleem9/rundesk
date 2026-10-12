# A RELATIONSHIP’S ROLLUPS ARE NEVER READ.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a Relationship’s rollups give each related task’s value of the rolled-up field — the owner sees both clients’, and Mia, who may not open the private one, sees only the one she may"
#   or "the sheet draws each related task’s rolled-up value beside it, and its picker offers the Clients list’s tasks and no task outside it"
#
# The field is answered without them.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (rollups.length) row.rollups = await this.rollupsFor(workspaceId, row.value as string[], rollups, reader)",
     "      if (rollups.length < 0) row.rollups = await this.rollupsFor(workspaceId, row.value as string[], rollups, reader)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-16-no-rollups: A RELATIONSHIP’S ROLLUPS ARE NEVER READ.')
