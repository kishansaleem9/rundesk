# A TASK MADE FROM A TEMPLATE LOSES ITS PEOPLE: WHO IS A MEMBER IS ASKED OF THE WRONG ID
# (`found-30-sep/templates-null-array-field-values`).
#
# The template holds the people, but the check that they are still members
# asks the project's id for a workspace, finds nobody, and writes no People
# value on the new task.
#
# Reddens: create-modal-templates: "and a task made from that template carries both lists in its own People and Labels fields (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "          .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, people)))\n"
b = "          .where(and(eq(workspaceMembers.workspaceId, projectId), inArray(workspaceMembers.userId, people))) // BROKEN: members of the wrong id\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-20-members-asked-of-the-project: a made task gets no People value')
