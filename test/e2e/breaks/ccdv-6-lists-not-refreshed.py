# THE DELETER’S LISTS KEEP THE DELETED CHANNEL.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
# Reddens: chat-channel-delete-and-views: "and it is in nobody’s list of channels any longer, the deleter’s sidebar included"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (selectedId === channelId) setSelectedId(null)\n      await qc.invalidateQueries({ queryKey: [\'chat-channels\', workspaceId] })\n      toast.success(t(\'chat.channelDeleted\'))',
     '      if (selectedId === channelId) setSelectedId(null)\n      toast.success(t(\'chat.channelDeleted\'))'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-6-lists-not-refreshed: THE DELETER’S LISTS KEEP THE DELETED CHANNEL.')
