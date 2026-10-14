# THE VIEWS TAB LISTS NO LIST’S VIEWS.
# (`found-14-oct/space-channel-views-unbuilt`)
# Reddens: chat-channel-delete-and-views: "a channel of a Space has Chat and Views tabs; Views lists the Space’s Folder, its List and the List’s saved view, in place of the conversation"
import io
p = '/home/user/rundesk/apps/web/src/components/chat/space-channel-views.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        views: await api<SavedView[]>(`/lists/${l.id}/views`).catch(() => []),',
     '        views: [],'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-9-views-unlisted: THE VIEWS TAB LISTS NO LIST’S VIEWS.')
