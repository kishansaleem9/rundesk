# "Create a task" makes the task and leaves the clip out of it.
#
# Re-aimed with the fix for `clip-create-task-persists-24h-url`. This patch
# used to drop `description: url`, and the check it reddened asserted that the
# description held the clip's link, a URL signed for 24 hours, which was the
# defect itself. The task now gets the clip as an attachment, so this drops the
# attach: the task is created, in the right list, with the clip's filename as
# its title, and the toast says "Task created from the clip", but the clip it
# was made from is nowhere on it.
#
# The title carries the filename, so the row looks complete in every list view,
# which is why the check reads the task's attachment rows rather than asking
# whether a task appeared.
#
# Reddens: clip-created-card: "and the clip is attached to it: one file, under the task’s own prefix, with the recording’s type and size"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "        await attachClipToTask(taskId, key, finished.file.name)\n"
b = "        void attachClipToTask\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: the task created from a clip does not get the clip.')
