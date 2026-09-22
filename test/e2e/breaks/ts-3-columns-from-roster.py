# The grid draws a column per person the SERVER returned rather than per person
# picked.
#
# IT RAN GREEN, AND THE HEADER'S OWN REASONING WAS WRONG. It said the fixture
# "seeds a third member who is never chosen, so they do not agree" — but Noor is
# never REQUESTED either, and the stub answers exactly the ids it was asked for,
# in the order asked. That faithfulness is deliberate and catches a page that
# ignores `userIds` altogether; what it cannot catch is a page that draws its
# columns from the payload, because a faithful answer makes the selection and
# the payload the same list. `order.map` and `columns.map` produced identical
# output and the check was right to pass.
#
# Never picked guards against a column per ROSTER member. A column per PAYLOAD
# entry is a different mistake, and `team-schedules` now has the stub volunteer
# Noor in every answer, so the two lists differ by one and the two readings are
# told apart. Every other check in that suite is unaffected, because a page
# reading the selection does not care what else the payload holds.
#
# PREDICTED ONE.
# Reddens: team-schedules: "choosing a second adds a second column, in the order they were picked"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        {order.map((userId) => {\n'
b = '        {columns.map(({ userId }) => {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: columns now come from the payload, not the selection.')
