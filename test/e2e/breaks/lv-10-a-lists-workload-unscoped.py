# A list's workload counts every list's tasks.
#
# Reddens: list-views: "another list’s Workload has none of it, and has its own"
#
# Re-aimed 13 October: it assigned `scope = undefined`, which TypeScript then narrowed to
# `undefined`, so `scope.listId` below did not build. The scope is dropped where it is read.
import io
p = "/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts"
s = io.open(p, encoding='utf-8').read()
a = """          scope
            ? or(
                eq(tasks.listId, scope.listId),
                inArray(tasks.id, this.db.select({ id: taskLists.taskId }).from(taskLists).where(eq(taskLists.listId, scope.listId))),
              )
            : undefined,"""
b = """          scope ? undefined : undefined,"""
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lv-10-a-lists-workload-unscoped: a list\'s workload counts every list\'s tasks')
