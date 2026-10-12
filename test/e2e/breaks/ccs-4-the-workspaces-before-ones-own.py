# THE WORKSPACE’S CONNECTION IS ASKED BEFORE ONE’S OWN.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "her mail is searched for her alone: she finds it, Max does not, and her source says it is her own"
#   or "with her own Drive connected, Mia’s search reaches her private files — Drive asked for everything she may see — and Max’s still reaches only the workspace’s shared ones"
#
# A person’s own connection answers only when the workspace has none.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (mine && grantCoversSource(source, mine.scopes)) return { token: mine.token, heldBy: 'you' }\n    const shared = (await this.workspaceGrants(workspaceId)).get(provider)\n    if (!shared) return null\n",
     "    const shared = (await this.workspaceGrants(workspaceId)).get(provider)\n    // BROKEN: the workspace's first\n    if (!shared) return mine && grantCoversSource(source, mine.scopes) ? { token: mine.token, heldBy: 'you' } : null\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-4-the-workspaces-before-ones-own: THE WORKSPACE’S CONNECTION IS ASKED BEFORE ONE’S OWN.')
