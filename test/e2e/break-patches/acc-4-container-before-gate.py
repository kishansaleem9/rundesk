# The gate still refuses, but only AFTER the hidden container project has been
# inserted — so a refused action still writes a row into somebody else's space.
# This is the half a "no list was created" check cannot see.
# Reddens: ai-create-containers: "and not even the hidden container project — the check runs before the first write"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """    const role = await this.memberRole(space.workspaceId, actorId)
    if (!role || role === 'guest') return refuse(kind, 'no_permission')
"""
b = """    if (this.lists && kind === 'list') await this.lists.defaultContainerForSpace(space.id, actorId)
    const role = await this.memberRole(space.workspaceId, actorId)
    if (!role || role === 'guest') return refuse(kind, 'no_permission')
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the space container is created before the permission check runs.')
