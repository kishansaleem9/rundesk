# THE MEETINGS PAGE'S CONNECT CALENDAR GOES TO SETTINGS → INTEGRATIONS again, which connects no calendar.
# Reddens: meetings-connect-calendar: "\"Connect Calendar\" opens the planner’s Accounts page, where a calendar is connected — not Settings → Integrations"
#   or "a member is taken there too — Settings sent them back to the start"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                to="/app/$workspaceId/calendar"\n                params={{ workspaceId }}\n                search={{ settings: \'accounts\' }}\n'
b = "                to={'/app/$workspaceId/settings' as never}\n                params={{ workspaceId } as never}\n                search={{ tab: 'integrations' } as never}\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-1-back-to-settings: the link goes to Settings, Integrations')
