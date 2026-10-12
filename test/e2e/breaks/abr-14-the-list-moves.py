# A RELATIONSHIP’S LIST IS CHANGED AFTER IT IS MADE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a Relationship limited to a list takes that list’s tasks and refuses any other in words; its list is kept once made; its rollups are fields that list’s tasks have, and need the list (read by SQL)"
#
# The list asked for is taken in place of the one it was made with.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if ((asked.listId ?? null) !== was.listId) throw new BadRequestException(RELATIONSHIP_LIST_KEPT)\n      set.config = await this.checkedTypeConfig(workspaceId, def.type, { listId: was.listId, rollups: asked.rollups ?? [] }, reader)",
     "      set.config = await this.checkedTypeConfig(workspaceId, def.type, { listId: asked.listId ?? was.listId, rollups: asked.rollups ?? [] }, reader)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-14-the-list-moves: A RELATIONSHIP’S LIST IS CHANGED AFTER IT IS MADE.')
