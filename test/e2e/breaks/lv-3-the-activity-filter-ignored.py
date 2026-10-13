# The activity filter read and not applied: every kind comes back.
#
# Reddens: list-views: "the activity filter keeps only comments, and their number is the count the filter offers"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="      actions.length ? inArray(sql`${taskActivity.action}::text`, actions) : undefined,\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
