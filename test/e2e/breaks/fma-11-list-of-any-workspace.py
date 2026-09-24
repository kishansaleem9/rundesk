# A LIST IS READ WITHOUT ITS WORKSPACE: the caller's role in THEIR workspace opens a list in anybody's.
# MOVED 24 September from meeting-access, where it was `mtg-2` and stayed green in
# two plans: a meeting keeps its own check that the list is its workspace's, so
# the list rule's workspace is the second of two there. In a form it is the only
# one — the space's create gate has no level to read for a non-member, and lets
# them through — so an outsider's own form, aimed at this workspace's list, is
# where losing it shows.
# Reddens: form-access: "a form made in another organisation’s workspace files nothing here: aimed at this workspace’s list, made or changed to it, it is not found and none points at it — aimed at their own list, it is made"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
a = '    .where(and(eq(lists.id, listId), eq(spaces.workspaceId, workspaceId)))\n'
b = '    .where(eq(lists.id, listId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fma-11-list-of-any-workspace: applied")
