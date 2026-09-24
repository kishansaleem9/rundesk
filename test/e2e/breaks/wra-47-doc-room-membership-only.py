# A DOC'S ROOM BY MEMBERSHIP, as it was: every edit, whole, to anybody in the workspace.
# Reddens: workspace-read-access: "a member cannot join the realtime room of a doc they may not open, nor hear its edits — while they join an open doc’s and hear it, and the admin hears the private one"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      return !!doc && canReadDoc(this.db, doc, userId, isManagerRole(membership.role as string))\n'
b = '      return !!doc\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-47-doc-room-membership-only: applied")
