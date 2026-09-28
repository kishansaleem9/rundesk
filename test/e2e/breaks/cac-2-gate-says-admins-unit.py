# THE GATE SAYS "YOUR WORKSPACE ADMINS HAVE BEEN ASKED" AGAIN, though the ask goes to the ClickApps managers.
# Reddens: unit: clickapps-copy.test.ts "the gate’s answers name the people who manage ClickApps, not admins"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
a = "  'gate.sent': 'The people who manage ClickApps here have been asked.',\n"
b = "  'gate.sent': 'Your workspace admins have been asked.',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cac-2-gate-says-admins-unit: done')
