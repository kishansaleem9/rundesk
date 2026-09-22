# "Don't ask again" closes the prompt and remembers nothing.
#
# The suite's own comment is the description: "Without this check the mute
# button is a label: it closes the prompt, which is what dismissing does
# anyway, and the difference only shows on the NEXT assignment."
#
# That is why the check costs two extra task loads. Everything visible is
# identical — the button is there, it is pressed, the prompt goes — and the
# defect only exists in the future, on a different task, after a full page
# load. A check written where the button is pressed would pass.
#
# `mutePriorityPrompt()` writes one key to `localStorage` and the line beside it
# closes the prompt, so deleting the write leaves a handler that still does
# something. It is not a dead control; it is a control that does half of what
# it says, which is the harder half to notice.
#
# ONE CHECK. The prompt still appears, the chain still completes, and the
# teammate check below still passes — because that one turns on identity rather
# than on the mute, and the suite un-mutes before it to make sure the two
# cannot be confused.
#
# Reddens: assign-to-priorities: "after \"Don't ask again\", assigning stops offering"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                onClick={() => {
                  mutePriorityPrompt()
                  setPriorityPromptOpen(false)
                }}"""
b = """                onClick={() => {
                  setPriorityPromptOpen(false)
                }}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: "Don\'t ask again" is now an ordinary dismiss.')
