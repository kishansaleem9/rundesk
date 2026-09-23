# "ALL CAUGHT UP" THAT NEVER COMES: the refusal half with no positive half.
# Reddens: inbox-scope: "and once A’s last unread is read from its own Inbox, it IS all caught up"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-inbox-page.tsx'
a = "          {unreadUnderChip === 0 && notifs.length > 0 && view === 'inbox' && (\n"
b = "          {unreadUnderChip === -1 && notifs.length > 0 && view === 'inbox' && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-23-never-caught-up: applied")
