# AN INVITED PERSON'S TASK IS LEFT UNASSIGNED AND NOT HELD FOR THEM.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "each of the four is invited into this workspace once, with ClickUp’s role for them, and the invitation is emailed; their five tasks wait for them, while Ana, a member, is on hers already"
#   or "“Invite everyone who is not here” sets the four to their invitations; the run reports the Space, its Folder, two Lists, seven tasks (two subtasks), 27 comments, four people invited and five tasks held for them"
#   or "Nina accepts and is on her two tasks; Ola joins as an admin, as ClickUp had her, and is on hers; nothing is held for either any longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const invitedAs = !userId ? this.invited.get(p.key) : undefined\n',
     '      const invitedAs = undefined as string | undefined\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-15-invited-tasks-unheld: AN INVITED PERSON'S TASK IS LEFT UNASSIGNED AND NOT HELD FOR THEM.")
