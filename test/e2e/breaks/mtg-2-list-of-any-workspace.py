# A LIST IS READ WITHOUT ITS WORKSPACE: the caller's role in THEIR workspace opens a list in anybody's.
# Reddens: meeting-access: "they cannot aim their meeting’s action items at this workspace’s list (not found, nothing made) — their own list is let through"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
a = '    .where(and(eq(lists.id, listId), eq(spaces.workspaceId, workspaceId)))\n'
b = '    .where(eq(lists.id, listId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mtg-2-list-of-any-workspace: applied")
