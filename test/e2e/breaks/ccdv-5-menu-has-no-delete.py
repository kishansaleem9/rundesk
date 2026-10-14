# THE CHANNEL MENU OFFERS NO DELETE.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "its creator deletes it from its menu, asked first by name: the channel and its messages are gone, and the page leaves it"
import io
p = '/home/user/rundesk/apps/web/src/components/chat/chat-header.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                {onDeleteChannel && (\n                  <DropdownMenuItem destructive data-testid="chat-delete-channel" onClick={onDeleteChannel}>',
     '                {onDeleteChannel && false && (\n                  <DropdownMenuItem destructive data-testid="chat-delete-channel" onClick={onDeleteChannel}>'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-5-menu-has-no-delete: THE CHANNEL MENU OFFERS NO DELETE.')
