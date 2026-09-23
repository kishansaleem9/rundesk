# Once the task has its copy, the card deletes the clip from the library.
#
# It reads as tidying: the task has the recording, so why keep two? Because the
# library is the Clips Hub, where ClickUp keeps every clip, and the person who
# recorded it goes there to find it again. The task is fine; the clip is gone
# from everywhere else.
#
# Reddens: clip-created-card: "while the clip is kept in the workspace’s clips too, as ClickUp keeps every clip in its Clips Hub"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "        await attachClipToTask(taskId, key, finished.file.name)\n"
b = ("        await attachClipToTask(taskId, key, finished.file.name)\n"
     "        await api(`/workspaces/${workspaceId}/clips`, { method: 'DELETE', body: { storageKey: key } })\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: the clip leaves the library once the task has a copy.')
