# “INVITE EVERYONE WHO IS NOT HERE” INVITES ONLY THE FIRST OF THEM.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "“Invite everyone who is not here” sets the four to their invitations; the run reports the Space, its Folder, two Lists, seven tasks (two subtasks), 27 comments, four people invited and five tasks held for them"
#   or "each of the four is invited into this workspace once, with ClickUp’s role for them, and the invitation is emailed; their five tasks wait for them, while Ana, a member, is on hers already"
import io
p = '/home/user/rundesk/apps/web/src/pages/import-apps.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                      onClick={() => setMapped({ ...mapped, ...Object.fromEntries(invitable.map((p) => [p.key, INVITE + p.invite])) })}\n',
     '                      onClick={() => setMapped({ ...mapped, ...Object.fromEntries(invitable.slice(0, 1).map((p) => [p.key, INVITE + p.invite])) })}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-14-invite-all-invites-one: “INVITE EVERYONE WHO IS NOT HERE” INVITES ONLY THE FIRST OF THEM.')
