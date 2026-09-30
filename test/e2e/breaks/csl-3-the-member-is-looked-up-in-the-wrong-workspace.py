# A MEMBER IS LOOKED UP UNDER THE WRONG WORKSPACE, SO NO MEMBER WATCHES A MEMBERS-ONLY CLIP (`resume-defects/resume-7`).
#
# Two ids of the same type, swapped: the membership row is asked for with the
# viewer's id as the workspace, finds nothing, and every member of a workspace
# that blocks public sharing is refused its clips. Only a platform admin, let
# in before the question, still watches — which is why the check signs in a
# member who is nothing more.
#
# Reddens: clip-links: "while a member of the workspace, signed in and nothing more, watches it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, viewer.id!)))\n"
b = "      .where(and(eq(workspaceMembers.workspaceId, viewer.id!), eq(workspaceMembers.userId, viewer.id!)))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-3-the-member-is-looked-up-in-the-wrong-workspace: members are refused their own clips')
