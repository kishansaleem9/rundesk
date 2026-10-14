# DELETE ONLY ARCHIVES: THE CHANNEL AND ITS MESSAGES STAY.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "its creator deletes it from its menu, asked first by name: the channel and its messages are gone, and the page leaves it"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    await this.db.delete(chatChannels).where(eq(chatChannels.id, channelId))\n    if (this.r2.configured) {',
     '    await this.db.update(chatChannels).set({ archivedAt: new Date() }).where(eq(chatChannels.id, channelId))\n    if (this.r2.configured) {'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-3-delete-archives: DELETE ONLY ARCHIVES: THE CHANNEL AND ITS MESSAGES STAY.')
