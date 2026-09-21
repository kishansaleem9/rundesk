# The seventh path that forgets the pipeline: the list is inserted directly instead of
# through ListsService, so `seedListStatuses` never runs. The list exists, looks fine,
# and accepts status='done' while keeping status_category='open' forever.
# Reddens: ai-create-containers: "with the whole default status pipeline seeded on it — six statuses"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """      const row = await this.lists.createList(
        projectId,
        {
          name,
          description: args.kind === 'list' ? args.description : undefined,
          visibility: args.kind === 'list' && args.visibility === 'private' ? 'private' : 'public',
        },
        actorId,
      )
"""
b = """      const [row] = await this.db
        .insert(lists)
        .values({ projectId, name, createdById: actorId })
        .returning()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the AI inserts a list straight into the table, with no statuses.')
