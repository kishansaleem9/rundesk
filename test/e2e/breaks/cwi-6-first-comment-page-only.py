# ONLY THE FIRST PAGE OF A TASK'S COMMENTS IS READ.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "all 27 comments come in, oldest first — Ana’s under Ana, Nina’s (not a member yet) under the importer with her name at the head; its file with its bytes; its link and its dependency as related tasks"
#   or "every page of a List’s tasks is read — closed tasks and subtasks asked for, as ClickUp leaves them out unasked — and the comments’ second page from the oldest of the first; a List’s own statuses and a task’s files from their own pages"
#   or "“Invite everyone who is not here” sets the four to their invitations; the run reports the Space, its Folder, two Lists, seven tasks (two subtasks), 27 comments, four people invited and five tasks held for them"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (rows.length < 25) break\n',
     '      break\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-6-first-comment-page-only: ONLY THE FIRST PAGE OF A TASK'S COMMENTS IS READ.")
