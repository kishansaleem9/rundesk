# A PROJECT'S LISTS ARE ALL LISTED TO A GUEST who has one shared: the list
# beside it is named in their tree.
# Reddens: guest-read-scope: "a guest reads the tasks of a list shared with them, is refused the list beside it’s task, and is listed only the shared list"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '        visFilter = and(listVisibilityFilter(actor.id, isManager), isManager ? undefined : guestListFilter(this.db, actor.id))'
b = '        visFilter = listVisibilityFilter(actor.id, isManager)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("grs-6-lists-listed-to-guests: a project's lists are all listed to a guest")
