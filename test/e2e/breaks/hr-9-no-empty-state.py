# A BLANK PANEL WHERE "NOTHING HERE" SHOULD BE.
# Reddens: home-reminders: "and with none left, the panel says there are none rather than going blank"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '                <EmptyStateCard\n                  icon={<AlarmClock className="h-6 w-6" />}\n'
b = '                <div hidden><EmptyStateCard\n                  icon={<AlarmClock className="h-6 w-6" />}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = "                  description={t('appWorkspace.emptyRemindersBody')}\n                />\n"
b = "                  description={t('appWorkspace.emptyRemindersBody')}\n                /></div>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-9-no-empty-state: applied")
