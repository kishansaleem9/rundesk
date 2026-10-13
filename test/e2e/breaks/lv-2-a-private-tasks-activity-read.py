# The feed without the read rule: a private task's entries reach a reader who may not open it.
#
# Reddens: list-views: "a private task the reader may not open leaves no entry in their feed — the admin’s feed holds it"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="    const visFilter = await this.taskVisibilityFilterForList(listId, actor)\n    const actions = (opts.actions ?? []).filter(Boolean)"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    const visFilter = undefined as SQL | undefined\n    const actions = (opts.actions ?? []).filter(Boolean)"))
