# "AUTOSAVE FOR ME" WRITES FOR A READER WHO MAY NOT CHANGE THE VIEW: each of their changes is sent, and
# refused in their face.
# Reddens: view-autosave: "a member who may only read the view, with Autosave for me on, changes their own screen and nothing else: no write to the view, which keeps its grouping, and no refusal to read"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '  const autosaves = !!selectedSavedView?.autosave && viewOffersOf(selectedSavedView).change\n'
b = '  const autosaves = !!selectedSavedView?.autosave\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vas-2-autosave-writes-for-a-reader: list route: "Autosave for me" writes for a reader who may not change the view.')
