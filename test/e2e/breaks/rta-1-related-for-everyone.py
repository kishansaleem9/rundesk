# A TASK'S RELATED TASKS ARE WHOEVER'S READS IT, as they were: whole rows, a private one's description included.
# Reddens: related-task-access: "the member’s task names no related task they may not open — not its title, not its description — and keeps the open one; the admin’s keeps all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const readableRelated = reader\n      ? await readableTaskIds(this.db, homeWorkspaceId, reader.id, dependencyRows.map((d) => d.related.id), reader.role)\n      : null\n'
b = '    const readableRelated = null as Set<string> | null\n    void reader\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rta-1-related-for-everyone: applied")
