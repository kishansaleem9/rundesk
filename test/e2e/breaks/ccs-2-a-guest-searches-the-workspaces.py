# A GUEST SEARCHES THROUGH THE WORKSPACE’S CONNECTIONS.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "a guest uses no Connected Search: the workspace’s Drive finds them nothing, connecting their own is refused in words (403), and their sources say so"
#
# The credential rule asks nobody’s role.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (await this.isGuest(workspaceId, userId)) return null\n    const mine',
     '    // BROKEN: guests too\n    const mine'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-2-a-guest-searches-the-workspaces: A GUEST SEARCHES THROUGH THE WORKSPACE’S CONNECTIONS.')
