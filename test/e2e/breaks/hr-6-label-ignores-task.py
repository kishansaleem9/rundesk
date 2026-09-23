# A LABEL THAT READS ONLY THE NOTE: a task's reminder, which has none, is just
# "Reminders".
# Reddens: home-reminders: "a reminder on a task is listed by the task’s title"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = "                  const label = r.note?.trim() || r.taskTitle || r.messageBody || t('appWorkspace.reminders')\n"
b = "                  const label = r.note?.trim() || t('appWorkspace.reminders')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-6-label-ignores-task: applied")
