# A RELATIONSHIP LIMITED TO A LIST TAKES ANY TASK OF THE WORKSPACE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a Relationship limited to a list takes that list’s tasks and refuses any other in words; its list is kept once made; its rollups are fields that list’s tasks have, and need the list (read by SQL)"
#
# The list it is limited to is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("              if (ids.some((v) => !inList.has(v))) throw new BadRequestException(NOT_IN_RELATIONSHIP_LIST)\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-13-a-relationship-takes-any-task: A RELATIONSHIP LIMITED TO A LIST TAKES ANY TASK OF THE WORKSPACE.')
