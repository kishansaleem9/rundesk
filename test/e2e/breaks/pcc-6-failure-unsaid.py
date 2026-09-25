# THE ACCOUNTS PAGE DOES NOT SAY WHY A CALENDAR WAS NOT CONNECTED.
# Reddens: personal-calendar-connect: "the member’s \"Add account\" takes them to Google with their own grant, and one that failed is said on the Accounts page until it is closed"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-accounts-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {calendarError && (\n'
b = "        {calendarError && workspaceId === '' && (\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-6-failure-unsaid: the failure is not said')
