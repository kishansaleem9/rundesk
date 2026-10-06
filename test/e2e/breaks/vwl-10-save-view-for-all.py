# SAVE VIEW IS OFFERED TO EVERYBODY WHO CHANGES A VIEW, on a saved view and on a built-in tab.
# RE-AIMED 6 October: the chip is left out for a view that saves itself (`found-6-oct/autosave-switch-saves-nothing`).
# Reddens: view-writes-by-level: "in a view-only list the page offers the member no + View, no ⋯ on the admin’s views — no Update, Rename, Make default or Delete — and no Save view once they change one, on a saved view or a built-in tab"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '            {viewDirty && !autosaves && (selectedSavedViewId ? !!selectedSavedView && viewOffersOf(selectedSavedView).change : listAccess.views) && (\n'
b = '            {viewDirty && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-10-save-view-for-all: save view is offered to everybody who changes a view, on a saved view and on a built-in tab')
