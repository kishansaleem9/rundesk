# A CLIP'S LINK IN CHAT IS LEFT A BARE ADDRESS: nothing is drawn under the message.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "a clip’s link posted in a chat channel is drawn as the clip under the message: its title, its length, and a player whose address plays from the store"
#   or "a clip its link does not open for the reader — one its workspace keeps to its members, read by somebody who is not one — is said, not drawn as a player, while the open workspace’s clip plays for them"
#   or "a deleted clip’s link is said to be unavailable, not drawn as a player that fails"
import io
p = '/home/user/rundesk/apps/web/src/components/chat/chat-message-body.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      <ClipEmbeds tokens={clipTokens} />\n',
     '      <ClipEmbeds tokens={clipTokens.slice(0, 0)} /> {/* BROKEN: chat draws no clip */}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w1-chat-draws-no-clip: chat draws no clip')
