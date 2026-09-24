# THE MOVE PICKER'S RESOLVER FORGETS GUESTS: many spaces at once read the
# default for a guest, while one space at a time does not.
# RE-AIMED 24 September: a guest reads only what is shared with them now, so the
# guard refuses the open space before this rule is asked; the rule shows where the
# guest reaches a space without a grant on it — passing through to a shared list.
# Reddens: guest-space-level: "a guest who only passes through a space — a list in it shared with them — makes no list beside it, and the Move picker does not offer them the space"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "        : guest\n          ? { level: 'view', source: 'guest-default' }\n          : { level: row.defaultPermission, source: 'space-default' },\n"
b = "        : { level: row.defaultPermission, source: 'space-default' },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-2-picker-forgets-guests: the batch resolver reads the default for a guest')
