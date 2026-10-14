# A DIRECT MESSAGE IS DELETED LIKE A CHANNEL.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "a member who neither made the channel nor administers the workspace may not delete it, and a direct message is not deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (channel.isDm) throw new BadRequestException(\'Direct messages cannot be deleted\')\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-2-dm-deleted: A DIRECT MESSAGE IS DELETED LIKE A CHANNEL.')
