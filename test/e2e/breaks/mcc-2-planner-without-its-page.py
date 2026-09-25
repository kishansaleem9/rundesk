# CONNECT CALENDAR OPENS THE PLANNER AND NOT ITS ACCOUNTS PAGE: the link names no page.
# Reddens: meetings-connect-calendar: "\"Connect Calendar\" opens the planner’s Accounts page, where a calendar is connected — not Settings → Integrations"
#   or "a member is taken there too — Settings sent them back to the start"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                search={{ settings: 'accounts' }}\n"
b = '                search={{}}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-2-planner-without-its-page: the link names no page')
