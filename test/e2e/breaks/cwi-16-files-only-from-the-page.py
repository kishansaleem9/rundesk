# A TASK'S FILES ARE READ ONLY FROM THE PAGE OF TASKS, WHICH HAS NONE.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "all 27 comments come in, oldest first — Ana’s under Ana, Nina’s (not a member yet) under the importer with her name at the head; its file with its bytes; its link and its dependency as related tasks"
#   or "every page of a List’s tasks is read — closed tasks and subtasks asked for, as ClickUp leaves them out unasked — and the comments’ second page from the oldest of the first; a List’s own statuses and a task’s files from their own pages"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const all = t.attachments ?? (await this.api.get<CuTask>(`/task/${encodeURIComponent(t.id)}`)).attachments ?? []\n',
     '    const all = t.attachments ?? []\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-16-files-only-from-the-page: A TASK'S FILES ARE READ ONLY FROM THE PAGE OF TASKS, WHICH HAS NONE.")
