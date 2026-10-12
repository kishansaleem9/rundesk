# THE PALETTE SAYS NOTHING OF WHOSE CONNECTION ANSWERS.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "the palette tells Max his Drive results are the workspace’s, shared things only, and offers to connect his own — and that his Gmail is not connected, with the same offer"
#
# Through the workspace’s connection, the palette says only "Not connected".
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("              : activeSource.heldBy === 'workspace'\n                ? t('palette.sourceWorkspace')\n",
     "              : activeSource.heldBy === 'workspace' && !activeSource.heldBy\n                ? t('palette.sourceWorkspace')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-w2-the-workspaces-said-to-be-nobodys: THE PALETTE SAYS NOTHING OF WHOSE CONNECTION ANSWERS.')
