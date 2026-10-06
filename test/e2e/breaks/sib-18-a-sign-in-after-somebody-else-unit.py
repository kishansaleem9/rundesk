# ANOTHER TAB’S SIGN-IN IS FOLLOWED ONLY AFTER NOBODY WAS SIGNED IN (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
#
# A write that names this tab's person as newly signed in — after nobody, or
# after somebody else — is a sign-in to follow. Follow it only after nobody
# and a browser where somebody else had signed in since leaves this tab deaf.
#
# Reddens: unit: realtime.test.ts "another tab’s sign-in as this tab’s person after somebody else was signed in there opens this tab’s socket again on the browser’s session"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = '  return now !== null && now === here && who(oldValue) !== now\n'
b = '  return now !== null && now === here && who(oldValue) === null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-18-a-sign-in-after-somebody-else-unit: another tab’s sign-in is followed only after nobody')
