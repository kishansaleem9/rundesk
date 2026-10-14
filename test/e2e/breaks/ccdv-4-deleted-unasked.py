# A CHANNEL IS DELETED WITHOUT ASKING.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "its creator deletes it from its menu, asked first by name: the channel and its messages are gone, and the page leaves it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                  if (window.confirm(t(\'chat.deleteChannelConfirm\', { name: selectedChannel.name ?? \'\' }))) deleteChannelMutation.mutate(selectedChannel.id)',
     '                  deleteChannelMutation.mutate(selectedChannel.id)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-4-deleted-unasked: A CHANNEL IS DELETED WITHOUT ASKING.')
