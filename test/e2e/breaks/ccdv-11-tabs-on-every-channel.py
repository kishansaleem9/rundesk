# EVERY CHANNEL HAS THE VIEWS TAB, A SPACE OR NONE.
# (`found-14-oct/space-channel-views-unbuilt`)
# Reddens: chat-channel-delete-and-views: "a channel of no Space has no tabs: it is its conversation"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        {selectedChannel && !selectedChannel.isDm && selectedChannel.spaceId && (\n          <div className="flex items-center gap-1 border-b border-border px-4 py-1.5" data-testid="chat-channel-tabs">',
     '        {selectedChannel && !selectedChannel.isDm && (\n          <div className="flex items-center gap-1 border-b border-border px-4 py-1.5" data-testid="chat-channel-tabs">'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-11-tabs-on-every-channel: EVERY CHANNEL HAS THE VIEWS TAB, A SPACE OR NONE.')
