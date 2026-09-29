# The prompt names the teammate, and pressing it fills YOUR day instead.
#
# RE-AIMED 29 September (`ledger-rows/row-850`). This patch was written while
# the product refused a colleague's day on purpose: it took away the
# `userId === currentUserId` clause, so the prompt appeared for a teammate and
# pressing it wrote the task onto the assigner's own list — "a control that
# CANNOT do what it offers", while the sentence on screen named somebody else.
# The colleague half is built now, to ClickUp's rule ("Members, Admins, and
# Owners can add tasks to other people's priorities"), so offering is right
# and that clause is gone. What is left of the defect is its second half: the
# sentence names the teammate, and the write goes to you.
#
# One line: the branch that sends a colleague's add down its own write
# (`POST /people/:userId/priorities`). Without it the press falls through to
# your own add, which answers 201, says "Task added to your Priorities." and
# links to your Planner — every step of it works, about the wrong person, and
# the colleague whose day it claimed to fill never hears about it.
#
# SIX CHECKS, the colleague half after the press and nothing else: the prompt
# still appears and still names them, and the server's own rules below read
# rows of their own.
#
# Reddens: assign-to-priorities:
#   "the toast says whose priorities it went on"
#   "the task is on THEIR priorities, read back as them, by id"
#   "and it says who added it: the one who assigned it"
#   "and it is not on yours"
#   "the toast's link opens their priorities, where the task says who added it"
#   "in their Planner's Priorities, the task says \"Added by\" and who"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    if (priorityPrompt && priorityPrompt.userId !== currentUserId) return addToTheirPriorities(priorityPrompt)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: a colleague\'s "Add to priorities" writes onto your own list.')
