# DISCONNECTING ONE’S OWN TAKES NOTHING AWAY.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "Mia’s palette says her Gmail is her own and offers to disconnect it; disconnected, it is gone (read by SQL) and her mail is searched no more"
#
# The disconnect deletes no row and says it did.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .where(and(eq(userSearchConnections.workspaceId, workspaceId), eq(userSearchConnections.userId, userId), eq(userSearchConnections.provider, provider)))\n      .returning({ id: userSearchConnections.id })\n    if (gone.length === 0) throw new NotFoundException(PERSONAL_SEARCH_REFUSALS.notConnected)\n',
     "      .where(and(eq(userSearchConnections.workspaceId, workspaceId), eq(userSearchConnections.userId, userId), eq(userSearchConnections.provider, provider), eq(userSearchConnections.provider, '')))\n      .returning({ id: userSearchConnections.id })\n    // BROKEN: nothing taken, and said\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-8-disconnect-takes-nothing: DISCONNECTING ONE’S OWN TAKES NOTHING AWAY.')
