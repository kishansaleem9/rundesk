# The membership gate removed: anyone with an authenticated session can have the AI
# create a list in any space in the database, including workspaces they have never
# been a member of.
# Reddens: ai-create-containers: "creating there is refused as `no_permission`"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """    const role = await this.memberRole(space.workspaceId, actorId)
    if (!role || role === 'guest') return refuse(kind, 'no_permission')
"""
b = """    const role = (await this.memberRole(space.workspaceId, actorId)) ?? 'member'
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the container tools no longer check workspace membership.')
