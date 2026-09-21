# The headline becomes a generic one. The panel still works; it just no longer
# says what frame `12:40` says, which is the specification.
# Reddens: planner-onboarding: "with frame `12:40`'s own headline"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = '  \'planner.onboarding.title\': "You, but better organized",\n'
b = '  \'planner.onboarding.title\': "Get organized",\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('catalogs.ts: the onboarding headline no longer matches the frame.')
