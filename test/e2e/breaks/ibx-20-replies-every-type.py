# THE REPLIES PAGE ASKS FOR EVERY TYPE: whatever is unread is listed as a reply.
# Reddens: inbox-scope: "the Replies page lists both unread replies, and its badge says 2"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-replies-page.tsx'
a = "    types: REPLY_TYPES,\n    unreadOnly: filter === 'unread',\n"
b = "    unreadOnly: filter === 'unread',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-20-replies-every-type: applied")
