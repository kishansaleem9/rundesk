# A READER'S PRIVATE VIEW IS COUNTED AS THE LIST'S FIRST: the admin's first shared view is then not its default,
# and a private view the list was left on as its default keeps it.
# Reddens: view-writes-by-level: "on an empty list a reader’s private view does not take the list’s default, and the admin’s first view, shared, does"
#   or "a private view the list was left on as its default gives the default up to the list’s first shared view, so the list holds one, and its maker may rename it again"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = "        .where(and(eq(taskViews.listId, data.listId), ne(taskViews.visibility, 'private')))\n"
b = '        .where(eq(taskViews.listId, data.listId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-5-private-views-counted-for-the-default: a reader's private view decides the list's default")
