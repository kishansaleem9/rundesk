# ANY MEMBER DELETES A CHANNEL.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "a member who neither made the channel nor administers the workspace may not delete it, and a direct message is not deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!(await this.canModerateChannel(channel, userId))) {\n      throw new ForbiddenException(\'Only the channel creator or a workspace admin can delete this channel\')\n    }\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-1-anyone-deletes: ANY MEMBER DELETES A CHANNEL.')
