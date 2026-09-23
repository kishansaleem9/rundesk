# HOME'S REPLIES COUNT OVER EVERY TYPE: every unread notification is a reply.
# Reddens: inbox-scope: "unread, 2 replies and 1 assigned comment"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '  const repliesUnread = useUnreadCount({ workspaceId, types: REPLY_TYPES })\n'
b = '  const repliesUnread = useUnreadCount({ workspaceId })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-22-home-replies-count-every-type: applied")
