# The priority prompt appears when you assign ANYBODY, not only yourself.
#
# `userId === currentUserId` goes, and the prompt now offers to add a task to a
# colleague's priorities — a permission the API has deliberately not granted.
# `PrioritiesController` routes the write as `POST /workspaces/:id/priorities`
# with no `:userId` precisely so a client cannot "pass somebody else's id and
# expect it to work", and the comment above this mutation says the prompt "does
# not pretend to" offer it.
#
# So this patch produces a control that CANNOT do what it offers. Pressing it
# writes the task onto the assigner's own list, silently, while the sentence on
# screen named somebody else — and the colleague whose day it claimed to fill
# never hears about it.
#
# The condition is a three-clause `&&` and this is the clause that looks like a
# special case rather than a rule. The other two are about state ("is it muted",
# "is it already there"); this one is about identity, and reads as a narrowing
# somebody added for the demo.
#
# EXACTLY ONE CHECK, THE LAST. Assigning yourself still prompts, the chain still
# works end to end, and "Don't ask again" still remembers — nine checks green
# and one failing on the only assignment in the suite that is not to yourself.
#
# Reddens: assign-to-priorities: "assigning a teammate raises no prompt"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      if (userId === currentUserId && !priorityPromptMuted() && !isAlreadyPriority) {"
b = "      if (!priorityPromptMuted() && !isAlreadyPriority) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the prompt now offers to fill a colleague\'s priorities.')
