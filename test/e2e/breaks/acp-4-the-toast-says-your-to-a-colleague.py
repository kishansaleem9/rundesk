# THE TOAST AFTER ADDING TO A TEAMMATE'S PRIORITIES SAYS "YOUR PRIORITIES".
#
# `ledger-rows/row-850`. The colleague's toast borrows the sentence written for
# yourself: "Task added to your Priorities." The write went to the teammate and
# the link opens the teammate, so everything is right except the one sentence
# that tells you whose day you just changed.
#
# ONE CHECK: the toast's words.
#
# Reddens: assign-to-priorities: "the toast says whose priorities it went on"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "          toast.success(t('planner.addedToTheirPriorities', { name: them.name ?? t('taskDetail.userFallback') }), {\n"
b = "          toast.success(t('planner.addedToPriorities'), {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-4-the-toast-says-your-to-a-colleague: the teammate\'s toast says "your Priorities"')
