# A TASK'S DEPENDENCIES WITH NEITHER RULE: the query's own workspace condition
# gone, and the reader rule too, so a related task in another workspace is
# handed back whole.
#
# The rule is held twice for a reader: this query keeps the task's own
# workspace, and `readableTaskIds` keeps what the reader may open, in that
# workspace. Either alone leaves the foreign task out, so `tb-41` (the first)
# is measured by a unit test and `rta-1` (the second) by a private space in
# the same workspace. This takes both, so the check is shown to see a foreign
# task at all.
# Reddens: task-boundaries: "and so are its dependencies — the related task is handed back whole, so a foreign one was a read of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        .where(and(eq(taskDependencies.taskId, taskId), eq(spaces.workspaceId, homeWorkspaceId))),\n'
b = '        .where(eq(taskDependencies.taskId, taskId)),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
a = '    const readableRelated = reader\n      ? await readableTaskIds(this.db, homeWorkspaceId, reader.id, dependencyRows.map((d) => d.related.id), reader.role)\n      : null\n'
b = '    const readableRelated = null as Set<string> | null\n    void reader\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-46-foreign-dependencies-no-rule: applied")
