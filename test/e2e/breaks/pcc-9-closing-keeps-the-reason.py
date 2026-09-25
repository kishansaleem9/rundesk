# CLOSING THE ACCOUNTS PAGE LEAVES `calendarError` ON THE ADDRESS: a reload says the failure again.
# Reddens: personal-calendar-connect: "the member’s \"Add account\" takes them to Google with their own grant, and one that failed is said on the Accounts page until it is closed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      void navigate({ search: (prev) => ({ ...prev, settings: undefined, calendarError: undefined }), replace: true })\n'
b = '      void navigate({ search: (prev) => ({ ...prev, settings: undefined }), replace: true })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-9-closing-keeps-the-reason: closing keeps the reason')
