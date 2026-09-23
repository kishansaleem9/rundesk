# The mirror of the patch above: every federated source reports itself
# unconnected, forever. Each "says it is not connected" check still passes, and
# the registry has stopped answering the question.
# Re-anchored 23 September: `listSources` now tells each person whose account a
# grant is (`heldBy`), so the line this patched is two lines now. Same break.
#
# Reddens: app-catalogue: "while the same credential holding Sites.Read.All
#          reports itself connected"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "        ? { id, provider, connected: true, heldBy: 'you' as const }\n"
b = "        ? { id, provider, connected: false, heldBy: 'you' as const }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: every federated source is permanently unconnected.')
