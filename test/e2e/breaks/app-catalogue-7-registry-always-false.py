# The mirror of the patch above: every federated source reports itself
# unconnected, forever. Each "says it is not connected" check still passes, and
# the registry has stopped answering the question.
# Reddens: app-catalogue: "while the same credential holding Sites.Read.All
#          reports itself connected"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      return { id, provider, connected: scopes !== undefined && grantCoversSource(id, scopes) }\n"
b = "      return { id, provider, connected: false }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('search.service.ts: every federated source is permanently unconnected.')
