# A CLIP ITS LINK DOES NOT OPEN IS DRAWN AS THE CLIP'S CARD, not said.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "a clip its link does not open for the reader — one its workspace keeps to its members, read by somebody who is not one — is said, not drawn as a player, while the open workspace’s clip plays for them"
#   or "a deleted clip’s link is said to be unavailable, not drawn as a player that fails"
import io
p = '/home/user/rundesk/apps/web/src/components/clip-embed.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        data-testid="clip-embed-unavailable"\n',
     '        data-testid="clip-embed" // BROKEN: a refusal drawn as the clip\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w7-a-refused-clip-is-drawn-as-the-clip: a refused clip is drawn as the clip')
