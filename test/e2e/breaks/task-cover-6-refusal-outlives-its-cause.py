# The refusal stays on screen after the address changes. Typing no longer
# clears `linkError`, so the sentence about "mountains.jpg" sits under the good
# https address that replaced it — accusing it of a problem it does not have,
# which is the failure mode that teaches people to ignore the message.
#
# PREDICTED ONE.
#
# Reddens: task-cover: "and the refusal clears as soon as the address changes"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = "onChange={(e) => { setLinkValue(e.target.value); setLinkError(null) }}"
b = "onChange={(e) => { setLinkValue(e.target.value) }}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: a refusal outlives the address it was about.')
