# ASANA’S SUBTASKS ARE READ ALL THE WAY DOWN, AND THEIRS COME IN TOO.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "its subtasks come in as subtasks, one level deep as ClickUp’s Asana import brings them — a subtask’s own subtasks are not asked for — and every page Asana names is read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/asana.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        task.subtasks = subs.map((s) => this.task(s))\n',
     '        task.subtasks = await Promise.all(subs.map(async (s) => ({ ...this.task(s), subtasks: (await this.all<AsTask>(`${apiUrl()}/tasks/${encodeURIComponent(s.gid)}/subtasks?limit=100&opt_fields=${TASK_FIELDS}`)).map((x) => this.task(x)) })))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-4-every-subtask-asked: ASANA’S SUBTASKS ARE READ ALL THE WAY DOWN, AND THEIRS COME IN TOO.')
