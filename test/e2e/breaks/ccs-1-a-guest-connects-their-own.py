# A GUEST CONNECTS THEIR OWN SEARCH SOURCE.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "a guest uses no Connected Search: the workspace’s Drive finds them nothing, connecting their own is refused in words (403), and their sources say so"
#
# The personal connect asks no role.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (member?.role === 'guest') throw new ForbiddenException(PERSONAL_SEARCH_REFUSALS.guest)\n",
     '      // BROKEN: a guest is not refused\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-1-a-guest-connects-their-own: A GUEST CONNECTS THEIR OWN SEARCH SOURCE.')
