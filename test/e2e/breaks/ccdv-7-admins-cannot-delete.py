# A WORKSPACE ADMIN MAY NOT DELETE A CHANNEL SOMEBODY ELSE MADE.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "a workspace admin deletes a channel somebody else made"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (channel.isDm) throw new BadRequestException(\'Direct messages cannot be deleted\')\n    if (!(await this.canModerateChannel(channel, userId))) {',
     '    if (channel.isDm) throw new BadRequestException(\'Direct messages cannot be deleted\')\n    if (channel.createdById !== userId) {'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-7-admins-cannot-delete: A WORKSPACE ADMIN MAY NOT DELETE A CHANNEL SOMEBODY ELSE MADE.')
