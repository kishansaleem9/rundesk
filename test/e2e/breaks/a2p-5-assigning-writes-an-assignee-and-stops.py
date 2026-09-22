# Assigning yourself writes the assignee and offers nothing.
#
# The state Rundesk was in before §V2-S16: "Rundesk had none of the four.
# Assigning wrote an assignee and stopped." The mutation still succeeds, the
# chip still appears, the task still has you on it — and the chain the frames
# `15:50`–`16:05` describe never starts.
#
# `setPriorityPromptOpen(true)` is one line inside an `onSuccess` that already
# does something else, which is where a line goes missing during a merge
# without anything failing to compile.
#
# IT STOPS THE RUN AT 3 OF 10. The prompt never appears, its text reads '' —
# `readText` returns the empty string rather than throwing, so both of the
# first two checks fail with their own words — and then `priority-prompt-add`
# is clicked, which is a thirty-second Playwright timeout on an element that is
# not there. Six checks after it press or read something that only exists once
# the prompt has been taken.
#
# That is the shape of a patch aimed at the first link of a chain, and it is
# the honest result: the suite cannot evaluate "the toast offers to open
# Priorities" in a build where nothing was ever offered.
#
# Reddens: assign-to-priorities: "assigning the task to yourself raises the prompt"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """      if (userId === currentUserId && !priorityPromptMuted() && !isAlreadyPriority) {
        setPriorityPromptOpen(true)
      }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: assigning writes an assignee and the chain stops there.')
