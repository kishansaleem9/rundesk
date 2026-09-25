# SPACE IS OFFERED TO A GUEST AGAIN, whose role cannot make one.
# RE-AIMED 24 September: each create type now declares what a guest may do with it
# (`guests`), and both menus ask one hook (`useCreatable`); the mistake is the same.
# AND AGAIN, 25 September: green in its first run on the new rows, because
# `guests: 'no'` withholds it from a guest as the key does. For Space and Folder the
# two exclude the same people (custom roles only add keys, and every tier but a
# guest's holds `space.create`), so "offered to everybody" drops both.
# Reddens: role-permissions-web: "a guest is offered neither Space nor Project, nor Reports"
import io
p = '/home/user/rundesk/apps/web/src/lib/create-types.ts'
a = "scopedToSpace: false, isContainer: true, requires: 'space.create', guests: 'no' },\n"
b = "scopedToSpace: false, isContainer: true, guests: 'yes' },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-2-space-offered-to-all: Space is offered to everybody')
