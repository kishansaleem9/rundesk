# AN EMPTY LIST THAT NEVER INVITES A FIRST TASK: the empty state says "No tasks yet" and stops, whoever reads it.
# The suite reads the invitation once the list's access has answered; this takes it away for good, so the wait runs out.
# Reddens: list-empty-states: "it offers to create the first task, which is the right invitation here"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "            <p className=\"text-[15px] font-medium text-foreground mb-1\">{t('list.noTasksYet')}</p>\n            {listAccess.add && (\n"
b = "            <p className=\"text-[15px] font-medium text-foreground mb-1\">{t('list.noTasksYet')}</p>\n            {Boolean(0) && listAccess.add && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("list-empty-states-8-no-invitation: applied")
