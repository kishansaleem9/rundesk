# THE CLIP'S CARD IS DRAWN WITH A PLAYER THAT HAS NO ADDRESS.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "a clip’s link posted in a chat channel is drawn as the clip under the message: its title, its length, and a player whose address plays from the store"
#   or "a clip its link does not open for the reader — one its workspace keeps to its members, read by somebody who is not one — is said, not drawn as a player, while the open workspace’s clip plays for them"
import io
p = '/home/user/rundesk/apps/web/src/components/clip-embed.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        src={src ?? undefined}\n',
     '        src={src?.slice(0, 0) || undefined} // BROKEN: the player plays nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w9-the-player-has-no-address: the player has no address')
