# "AUTOSAVE FOR ME" SAVES NOTHING again: the switch is stored and nothing reads it.
# Reddens: view-autosave: "with Autosave for me on, a grouping changed on a saved view is saved to it — read back by SQL — with no Save view chip to press, and the view opens on it after a reload"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '  const autosaves = !!selectedSavedView?.autosave && viewOffersOf(selectedSavedView).change\n'
b = '  const autosaves = false as boolean\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vas-1-autosave-saves-nothing: list route: "Autosave for me" saves nothing.')
