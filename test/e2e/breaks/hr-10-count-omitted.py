# THE ENTRY WITHOUT A COUNT: reminders waiting and nothing to say so.
# Reddens: home-reminders: "and the Reminders entry counts what is waiting — the modal’s and the task’s, not the one that went off"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = ' count={pendingReminders.length} testId="home-nav-reminders" />'
b = ' testId="home-nav-reminders" />'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-10-count-omitted: applied")
