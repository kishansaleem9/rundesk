# A signed link goes back into the new task's description, as it did.
#
# A URL signed for a limited time, written into a row that lives for years: the
# next day the description links to nothing. The clip is still attached, so
# every other check holds; only the description carries the expiring link.
#
# RE-AIMED for `resume-defects/resume-7`: `clipShareUrl`, which signed the clip
# for a day, is gone (the card asks for the clip's own link, which does not
# expire), so the signed URL here is the one the clips library lists for the
# clip, signed for fifteen minutes. Same defect, a shorter fuse.
#
# Reddens: clip-created-card: "Create a task makes a task in this list, with no link that can expire in its description"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = "          body: JSON.stringify({ title: finished.file.name || t('clipCreated.title'), listId }),\n"
b = "          body: JSON.stringify({ title: finished.file.name || t('clipCreated.title'), listId, description: (await api<Array<{ storageKey: string; url: string }>>(`/workspaces/${workspaceId}/clips`)).find((c) => c.storageKey === key)?.url }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: the new task describes itself with a signed link that expires.')
