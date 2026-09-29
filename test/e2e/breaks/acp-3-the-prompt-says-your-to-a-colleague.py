# THE PROMPT FOR A TEAMMATE ASKS ABOUT "YOUR PRIORITIES".
#
# `ledger-rows/row-850`. The colleague's branch of the prompt falls back to the
# sentence written for yourself. It appears when it should, and pressing it
# writes to the right list — it only says the wrong person, which is the one
# thing the frame's prompt is careful about ("Add this task to Hamda Tahir's
# priorities?"). Somebody who reads "your" and presses Add has filled a
# colleague's day believing they filled their own.
#
# ONE CHECK: the words. Everything after the press is the teammate's, as it
# should be.
#
# Reddens: assign-to-priorities: "and it names them: \"Add this task to <their name>'s priorities?\""
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                : t('planner.addToPrioritiesAskFor', { name: priorityPrompt.name ?? t('taskDetail.userFallback') })}\n"
b = "                : t('planner.addToPrioritiesAsk')}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-3-the-prompt-says-your-to-a-colleague: the teammate\'s prompt asks about your priorities')
