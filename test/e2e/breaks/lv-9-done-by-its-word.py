# Closed read as the word 'done' again: a status of its own name keeps loading people.
#
# Reddens: list-views: "closed by a status of its own name, its hours leave the view and the workspace page"
import io
p="/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts"
s=io.open(p,encoding='utf-8').read()
a="          ne(tasks.statusCategory, 'closed'),\n          visFilter,\n          scope"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"          sql`${tasks.status} != 'done'`,\n          visFilter,\n          scope"))
