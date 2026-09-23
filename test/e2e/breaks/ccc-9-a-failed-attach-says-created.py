# An attach that failed is reported as a task created from the clip.
#
# The task exists, so "Task created from the clip" is half true, which makes it
# the facade: the person closes the card, and the recording, which was on the
# card and could still have been attached by hand, is gone with it.
#
# Reddens: clip-created-card: "and when the attach fails, the card says the clip is not on the task — not \"Task created\""
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "        toast.error(t('clipCreated.taskClipNotAttached'))\n"
b = "        toast.success(t('clipCreated.taskCreated'))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: a failed attach says the task was created from the clip.')
