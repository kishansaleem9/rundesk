# "ALL CAUGHT UP" AS IT WAS: nothing unread among the rows loaded.
# Reddens: inbox-scope: "every row on screen is read, ten behind them are not — so it is not \"all caught up\", and says 10 new"all caught up"every row on screen is read, ten behind them are not — so it is not \"all caught up\", and says 10 new"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-inbox-page.tsx'
a = "  const unreadUnderChip = (filter === 'primary' ? primaryCountsQuery.data : counts)?.unread\n"
b = '  const unreadUnderChip = notifs.filter((n) => !n.readAt).length\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-16-caught-up-from-loaded: applied")
