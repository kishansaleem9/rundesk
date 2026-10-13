# The list's feed without the list: every task the reader may see, anywhere.
#
# Reddens: list-views: "a comment in another list is never in this list’s feed"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="    return and(\n      or(eq(tasks.listId, listId), inArray(tasks.id, this.db.select({ id: taskLists.taskId }).from(taskLists).where(eq(taskLists.listId, listId)))),\n      visFilter,\n      actions.length"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    return and(\n      visFilter,\n      actions.length"))
