# THE BADGES AS THEY WERE: every workspace's unread, in each workspace.
# Reddens: inbox-scope: "the sidebar and the bell count A’s"
import io
p = '/home/user/rundesk/apps/web/src/lib/notifications-query.ts'
a = "    queryFn: () => api<{ count: number }>(notificationsUrl('/notifications/unread-count', params)),\n"
b = "    queryFn: () => api<{ count: number }>(notificationsUrl('/notifications/unread-count', { ...params, workspaceId: undefined })),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-17-badges-unscoped: applied")
