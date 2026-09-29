# Assigning writes the assignee and offers nothing — for yourself or anybody.
#
# The state Rundesk was in before §V2-S16: "Rundesk had none of the four.
# Assigning wrote an assignee and stopped." The mutation still succeeds, the
# chip still appears, the task still has its assignee — and the chain the
# frames `15:50`–`16:05` describe never starts.
#
# The offer is one line inside an `onSuccess` that already does something
# else, which is where a line goes missing during a merge without anything
# failing to compile. Re-aimed 29 September: that line is now
# `offerPriorities(userId)`, which asks for yourself and, since
# `ledger-rows/row-850`, for a colleague — so both halves go with it.
#
# It stopped the run at 3 of 10 when the presses after the prompt were
# unbounded. They are bounded and caught now, so every check reports: the two
# halves of the chain fail in their own words, while "Don't ask again" passes
# (nothing asks, so nothing is heard again) and the server's rules, which no
# prompt reaches, hold.
#
# That is the shape of a patch aimed at the first link of a chain, and it is
# the honest result: the suite cannot evaluate "the toast offers to open
# Priorities" in a build where nothing was ever offered.
#
# Reddens: assign-to-priorities:
#   "assigning the task to yourself raises the prompt"
#   "and it offers both ways out the frame shows"
#   "a toast confirms it"
#   "and the toast offers to open Priorities"
#   "the link goes to the Planner"
#   "the task is on your priorities, by id — not a copy of its title"
#   "and THAT task is in the Priorities rail"
#   "with the counter the frame shows"
#   "assigning a teammate offers too"
#   "and it names them: \"Add this task to <their name>'s priorities?\""
#   "the toast says whose priorities it went on"
#   "the task is on THEIR priorities, read back as them, by id"
#   "and it says who added it: the one who assigned it"
#   "and it is not on yours"
#   "the toast's link opens their priorities, where the task says who added it"
#   "in their Planner's Priorities, the task says \"Added by\" and who"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      await offerPriorities(userId)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: assigning writes an assignee and the chain stops there.')
