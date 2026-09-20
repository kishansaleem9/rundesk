# The breakdown quietly narrows to open work, so an answer that says "all current
# tasks" is built from a number that never counted the finished or in-flight ones.
# Reddens: ai-create-containers: "and the breakdown moves by exactly one, in the in-progress bucket"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          taskVisibilityFilter(this.db, actorId, isManager),
        ),
      )
      .groupBy(tasks.status, tasks.statusCategory)
"""
b = """          eq(spaces.workspaceId, workspaceId),
          eq(tasks.isArchived, false),
          eq(tasks.statusCategory, 'open'),
          taskVisibilityFilter(this.db, actorId, isManager),
        ),
      )
      .groupBy(tasks.status, tasks.statusCategory)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the per-status breakdown only ever counts open tasks.')
