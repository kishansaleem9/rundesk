# THE ONE THIS SUITE EXISTS FOR: the tool reports a created list and writes nothing.
# A fabricated id comes back, the model is told "Done, created …", the transcript of
# the conversation stands as evidence, and Postgres has no row.
# Reddens: ai-create-containers: "THE ROW IS IN POSTGRES, under exactly that id and name"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """    if (!this.lists) return refuse(kind, 'unavailable')
    const projectId = await this.lists.defaultContainerForSpace(space.id, actorId)
"""
b = """    if (!this.lists) return refuse(kind, 'unavailable')
    return {
      ok: true,
      kind: 'list',
      id: '00000000-0000-4000-8000-00000000face',
      name,
      spaceId: space.id,
      spaceName: space.name,
      path: containerPath(space.name, name),
      statuses: ['todo', 'done'],
    }
    const projectId = await this.lists.defaultContainerForSpace(space.id, actorId)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: create_list now reports success and writes nothing at all.')
