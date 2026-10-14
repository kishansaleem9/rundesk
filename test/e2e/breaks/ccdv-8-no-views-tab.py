# A SPACE’S CHANNEL HAS NO VIEWS TAB.
# (`found-14-oct/space-channel-views-unbuilt`)
# Reddens: chat-channel-delete-and-views: "a channel of a Space has Chat and Views tabs; Views lists the Space’s Folder, its List and the List’s saved view, in place of the conversation"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {selectedChannel && !selectedChannel.isDm && selectedChannel.spaceId && (\n          <div className="flex items-center gap-1 border-b border-border px-4 py-1.5" data-testid="chat-channel-tabs">',
     '        {selectedChannel && !selectedChannel.isDm && selectedChannel.spaceId && false && (\n          <div className="flex items-center gap-1 border-b border-border px-4 py-1.5" data-testid="chat-channel-tabs">'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-8-no-views-tab: A SPACE’S CHANNEL HAS NO VIEWS TAB.')
