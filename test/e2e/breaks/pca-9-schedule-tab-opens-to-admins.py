# THE WORK SCHEDULE TAB IS AN ADMIN'S AGAIN: the member granted workspace.schedule.manage is sent to another tab.
# Reddens: people-calendar-access: "Settings opens Work schedule to the member granted workspace.schedule.manage, with the seven weekdays and the holiday form — and sends the manager to a tab of theirs instead"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  workSchedule: ['workspace.schedule.manage'],\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pca-9-schedule-tab-opens-to-admins: workSchedule opens by no key')
