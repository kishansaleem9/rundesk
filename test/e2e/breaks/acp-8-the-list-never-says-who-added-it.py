# THE PRIORITIES LIST NEVER SAYS WHO ADDED A ROW, THOUGH EVERY ROW RECORDS IT.
#
# `ledger-rows/row-850`. The read drops `addedBy`: the column is written on
# every add and read by nothing — the stored value no reader honours. The
# write is right and the row is the teammate's; the list simply cannot say
# that somebody else put it there, so neither surface can either.
#
# Reddens: assign-to-priorities:
#   "and it says who added it: the one who assigned it"
#   "the toast's link opens their priorities, where the task says who added it"
#   "in their Planner's Priorities, the task says \"Added by\" and who"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "        addedBy: { id: adder.id, displayName: adder.displayName },\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-8-the-list-never-says-who-added-it: listPriorities returns no addedBy')
