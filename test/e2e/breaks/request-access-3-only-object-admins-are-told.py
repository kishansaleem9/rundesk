# The fan-out narrows to people holding admin ON THE OBJECT, dropping the
# workspace's admins.
#
# It reads like a tightening — "tell whoever owns this thing, not everybody
# with a big role" — and for a task nobody has explicitly shared it means
# telling nobody. `objectShares` holds rows only where somebody was granted
# access one object at a time; a private task created and kept by one person
# has none. The endpoint then answers `no_owners`, which the card cannot
# distinguish from `sent`, on purpose:
#
#   "The server distinguishes 'sent' from 'already_asked' from 'no_owners',
#    and showing those apart would leak how the object is owned to somebody
#    who cannot see the object."
#
# That deliberate silence is what makes this patch invisible from the screen.
# The button is pressed, the confirmation appears, `notified` is 0, and the
# only way to know is the owner's inbox — which is the check this reddens, and
# the reason the suite ends in somebody else's notifications rather than in a
# toast.
#
# The de-dup row is still written, so a second press inside a day returns
# `already_asked` and stays quiet too. A person could press it once a day for
# a week and never be told that nobody is listening.
#
# Reddens: request-access: "and whoever can grant it hears about THIS object"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = """    const recipients = [
      ...new Set([...objectAdmins.map((a) => a.userId), ...wsAdmins.map((a) => a.userId)]),
    ].filter((id): id is string => !!id && id !== requester.id)
"""
b = """    const recipients = [
      ...new Set(objectAdmins.map((a) => a.userId)),
    ].filter((id): id is string => !!id && id !== requester.id)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shares.service.ts: only object-level admins are told, so a private task tells nobody.')
