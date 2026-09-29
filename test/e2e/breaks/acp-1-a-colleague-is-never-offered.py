# ASSIGNING A TEAMMATE OFFERS NOTHING AGAIN: the prompt is yours alone, as it was.
#
# `ledger-rows/row-850`. The guest rule in `offersPriority` loses its guest
# clause, so it refuses every colleague — the product's old answer, when a
# colleague's day was refused on purpose. Assigning yourself still offers,
# still lands in your rail, and "Don't ask again" still remembers; every
# assignment of somebody else writes the assignee and stops.
#
# The first link of the colleague chain, so the rest of it goes too: nothing is
# pressed, nothing is written to the teammate, nobody's list says who added
# anything. The server's rules below read rows of their own and hold.
#
# Reddens: assign-to-priorities:
#   "assigning a teammate offers too"
#   "and it names them: \"Add this task to <their name>'s priorities?\""
#   "the toast says whose priorities it went on"
#   "the task is on THEIR priorities, read back as them, by id"
#   "and it says who added it: the one who assigned it"
#   "and it is not on yours"
#   "the toast's link opens their priorities, where the task says who added it"
#   "in their Planner's Priorities, the task says \"Added by\" and who"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-priorities.ts'
a = "  if (opts.assigneeId !== opts.currentUserId && opts.viewerRole === 'guest') return false\n"
b = "  if (opts.assigneeId !== opts.currentUserId) return false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-1-a-colleague-is-never-offered: assigning somebody else offers nothing')
