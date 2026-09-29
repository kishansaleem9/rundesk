# THE BANNER OFFERS MARK SEEN AGAIN, beside Dismiss.
# Reddens: announcement-views: "the home banner offers Dismiss and no Mark seen, a button that counted a click and changed nothing"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '            <div className="flex items-center gap-2 shrink-0">\n'
b = '            <div className="flex items-center gap-2 shrink-0">\n              <Button size="sm" variant="outline" onClick={() => {}}>Mark seen</Button>\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-6-mark-seen-back: the banner offers Mark seen')
