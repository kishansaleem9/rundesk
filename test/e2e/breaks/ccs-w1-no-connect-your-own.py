# THE PALETTE OFFERS NOBODY THEIR OWN CONNECTION.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "the palette tells Max his Drive results are the workspace’s, shared things only, and offers to connect his own — and that his Gmail is not connected, with the same offer"
#
# No "Connect your own" is drawn.
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          {activeSource.canConnect && activeSource.heldBy !== 'you' && (\n",
     "          {activeSource.canConnect && activeSource.heldBy !== 'you' && !activeSource.canConnect && (\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-w1-no-connect-your-own: THE PALETTE OFFERS NOBODY THEIR OWN CONNECTION.')
