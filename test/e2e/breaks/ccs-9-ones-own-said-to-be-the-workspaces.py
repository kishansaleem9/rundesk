# ONE’S OWN SOURCE IS SAID TO BE THE WORKSPACE’S.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "her mail is searched for her alone: she finds it, Max does not, and her source says it is her own"
#   or "Mia’s palette says her Gmail is her own and offers to disconnect it; disconnected, it is gone (read by SQL) and her mail is searched no more"
#
# The sources answer a person’s own connection as the workspace’s.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (mine && grantCoversSource(id, mine.scopes)) return { id, provider, connected: true, heldBy: 'you' as const, canConnect: true }\n",
     "      if (mine && grantCoversSource(id, mine.scopes)) return { id, provider, connected: true, heldBy: 'workspace' as const, canConnect: true } // BROKEN\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-9-ones-own-said-to-be-the-workspaces: ONE’S OWN SOURCE IS SAID TO BE THE WORKSPACE’S.')
