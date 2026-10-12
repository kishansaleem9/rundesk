# A MEMBER IS NOT OFFERED THEIR OWN GMAIL: told it is not connected, and given no way to connect it.
#
# Re-aimed 12 October: Connected Search is person by person (`found-23-sep/connected-search-per-person`):
# anybody but a guest connects their own. This patch draws "Connect your own" only where one is connected.
# Reddens: search-sources: "a member choosing Gmail is told it is not connected and offered to connect their own — and no Connect for the workspace"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = "{activeSource.canConnect && activeSource.heldBy !== 'you' && ("
b = "{activeSource.canConnect && activeSource.heldBy === 'you' && ("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("search-sources-6-notice-says-not-connected: applied")
