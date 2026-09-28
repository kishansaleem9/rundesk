# EVERY CARD GETS THE FIRST COVER IN THE PAYLOAD.
#
# The facade that demos best: open a list where one task has a cover and every
# card has one. "The cover reaches the list" is true, "the card draws a cover"
# is true, and the only check that notices is the one that asks a task WITHOUT
# a cover what it got.
#
# Reddens list-card-cover: "a task with no cover comes back with none — not its
# neighbour's" and "the coverless card draws nothing".
#
# Reddens: list-card-cover: "and a task with no cover comes back with none — not its neighbour's"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      coverUrl: coverUrlByTask.get(r.id) ?? null,"
b = "      coverUrl: coverUrlByTask.get(r.id) ?? [...coverUrlByTask.values()].find(Boolean) ?? null,"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tasks.service.ts: a task with no cover now borrows the first cover in the list payload.")
