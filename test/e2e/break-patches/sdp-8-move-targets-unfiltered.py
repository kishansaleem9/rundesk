# The Move picker goes back to offering every space the actor can SEE, including
# the ones the server will refuse to accept anything into. Seeing a space and
# being allowed to put something in it are different questions, and a
# destination that 403s on arrival is a dead control with a friendly name.
# Reddens: space-default-permission:
#   "a space the member may not write to is not offered as a move destination"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = """    const visible = actorId ? await this.narrowToWritable(workspaceId, seen, actorId) : seen
"""
b = """    const visible = seen
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: moveTargets no longer filters to the spaces the actor may write to.')
