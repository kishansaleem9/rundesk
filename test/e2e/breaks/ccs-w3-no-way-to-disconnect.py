# THE PALETTE OFFERS NO WAY TO DISCONNECT ONE’S OWN.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "Mia’s palette says her Gmail is her own and offers to disconnect it; disconnected, it is gone (read by SQL) and her mail is searched no more"
#
# No "Disconnect yours" is drawn.
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          {activeSource.heldBy === \'you\' && (\n            <button\n              type="button"\n              data-testid="palette-source-disconnect-own"',
     '          {activeSource.heldBy === \'you\' && !activeSource.heldBy && (\n            <button\n              type="button"\n              data-testid="palette-source-disconnect-own"'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-w3-no-way-to-disconnect: THE PALETTE OFFERS NO WAY TO DISCONNECT ONE’S OWN.')
