# A ROW THAT LOOKS PRESSABLE AND GOES NOWHERE.
# Reddens: home-reminders: "pressing a task’s reminder opens that task"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '                        if (leads) void openReminder(r)\n'
b = '                        if (leads) void 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-7-reminder-leads-nowhere: applied")
