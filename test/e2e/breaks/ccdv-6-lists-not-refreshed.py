# THE DELETER’S LISTS KEEP THE DELETED CHANNEL.
# (`found-14-oct/chat-channel-cannot-be-deleted`)
#
# Neither the answer to the delete nor the event that says a channel was deleted
# refreshes the page's lists of channels, so the channel stays in the sidebar of
# the person who deleted it until they reload. Both go: the deleter is a member
# of the channel and is sent the event too, so either alone still refreshes the
# list — measured 14 October, when the answer's refresh alone was taken away and
# the check stayed green.
#
# Reddens: chat-channel-delete-and-views: "and it is in nobody’s list of channels any longer, the deleter’s sidebar included"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (selectedId === channelId) setSelectedId(null)\n      await qc.invalidateQueries({ queryKey: [\'chat-channels\', workspaceId] })\n      toast.success(t(\'chat.channelDeleted\'))',
     '      if (selectedId === channelId) setSelectedId(null)\n      toast.success(t(\'chat.channelDeleted\'))'),
    ("      if (event.type === 'chat.channel.deleted' && event.channelId) {\n        qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })\n",
     "      if (event.type === 'chat.channel.deleted' && event.channelId) {\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-6-lists-not-refreshed: THE DELETER’S LISTS KEEP THE DELETED CHANNEL.')
