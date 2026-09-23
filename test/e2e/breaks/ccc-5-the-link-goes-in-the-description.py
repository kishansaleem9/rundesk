# The share link goes back into the new task's description, as it did.
#
# A URL signed for 24 hours, written into a row that lives for years: the next
# day the description links to nothing. The clip is still attached, so every
# other check holds; only the description carries the expiring link.
#
# Reddens: clip-created-card: "Create a task makes a task in this list, with no link that can expire in its description"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "          body: JSON.stringify({ title: finished.file.name || t('clipCreated.title'), listId }),\n"
b = "          body: JSON.stringify({ title: finished.file.name || t('clipCreated.title'), listId, description: await clipShareUrl(workspaceId!, key) }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: the new task describes itself with a 24-hour link.')
