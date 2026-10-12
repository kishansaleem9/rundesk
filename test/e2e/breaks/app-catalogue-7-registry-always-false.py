# The mirror of the patch above: every federated source reports itself
# unconnected, forever. Each "says it is not connected" check still passes, and
# the registry has stopped answering the question.
# Re-anchored 23 September: `listSources` now tells each person whose account a
# grant is (`heldBy`), so the line this patched is two lines now. Same break.
# Re-aimed 12 October: Connected Search answers "connected" on three lines now —
# the person's own grant, their own Gmail, the workspace's — and all three say
# no. Same break.
#
# Reddens: app-catalogue: "while the same credential holding Sites.Read.All
#          reports itself connected"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "connected: true, heldBy: 'you' as const, canConnect: true }"
b = "connected: false, heldBy: 'you' as const, canConnect: true }"
a2 = "connected: true, heldBy: 'workspace' as const, canConnect: true }"
b2 = "connected: false, heldBy: 'workspace' as const, canConnect: true }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 2, f'anchor appears {s.count(a)} times in {p}, expected exactly 2'
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(a2, b2))
print('search.service.ts: every federated source is permanently unconnected.')
