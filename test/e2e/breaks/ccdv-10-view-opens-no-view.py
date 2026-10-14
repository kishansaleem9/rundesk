# A VIEW OPENS ITS LIST BUT NOT ON THE VIEW.
# (`found-14-oct/space-channel-views-unbuilt`)
# Reddens: chat-channel-delete-and-views: "and a view opens its List on that view"
import io
p = '/home/user/rundesk/apps/web/src/components/chat/space-channel-views.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              search={{ view: v.id }}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccdv-10-view-opens-no-view: A VIEW OPENS ITS LIST BUT NOT ON THE VIEW.')
