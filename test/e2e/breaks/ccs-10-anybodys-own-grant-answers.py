# ANYBODY’S OWN CONNECTION ANSWERS ANY SEARCHER.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "with her own Drive connected, Mia’s search reaches her private files — Drive asked for everything she may see — and Max’s still reaches only the workspace’s shared ones"
#   or "her mail is searched for her alone: she finds it, Max does not, and her source says it is her own"
#   or "the palette tells Max his Drive results are the workspace’s, shared things only, and offers to connect his own — and that his Gmail is not connected, with the same offer"
#
# Measured 12 October: the last 2 of these are knock-ons of the same edit, measured on lane 8 — checks that stand on what the first ones lost.
#
# A person’s own grant is read for whoever searches.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      .where(and(eq(userSearchConnections.workspaceId, workspaceId), eq(userSearchConnections.userId, userId)))\n    const own = new Map<string, { token: string; scopes: readonly string[] }>()\n    for (const row of rows) {\n      // Read in code as well as in SQL: a row is this person's or nobody's here.\n      if (row.userId !== userId || row.status !== 'connected' || !row.accessToken) continue\n",
     "      .where(eq(userSearchConnections.workspaceId, workspaceId)) // BROKEN: anybody's\n    const own = new Map<string, { token: string; scopes: readonly string[] }>()\n    for (const row of rows) {\n      if (row.status !== 'connected' || !row.accessToken) continue\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-10-anybodys-own-grant-answers: ANYBODY’S OWN CONNECTION ANSWERS ANY SEARCHER.')
