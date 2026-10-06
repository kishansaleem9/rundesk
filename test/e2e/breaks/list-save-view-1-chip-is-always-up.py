# The Save view chip loses its `viewDirty` guard and is always on the toolbar.
#
# Which makes it a button, not a message. The whole item is that its PRESENCE
# is the affordance — the frame shows it appearing, highlighted, once the view
# has been changed — and a chip that is always there tells you nothing about
# whether anything is unsaved. The state it was added to report is exactly the
# state it can no longer report.
#
# It is also what the feature degrades into under the most ordinary pressure:
# somebody reports the chip "disappearing", the guard looks like the cause, and
# removing it makes the complaint go away.
#
# REDDENS THE FIRST AND THE LAST, WHICH ARE THE SAME CLAIM FROM BOTH ENDS —
# nothing to save before the change, nothing to save after the save. The three
# in between still pass: the chip is there to click, the PATCH goes out, and it
# carries the right config. A patch that reddened those as well would be about
# saving rather than about the chip.
#
# RE-AIMED 6 October: the chip is left out for a view that saves itself (`found-6-oct/autosave-switch-saves-nothing`).
# Reddens: list-save-view: "a view you have not touched offers nothing to save"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '            {viewDirty && !autosaves && (selectedSavedViewId ? !!selectedSavedView && viewOffersOf(selectedSavedView).change : listAccess.views) && (\n              <button\n                type="button"\n                data-testid="list-save-view"'
b = '            {(selectedSavedViewId ? !!selectedSavedView && viewOffersOf(selectedSavedView).change : listAccess.views) && (\n              <button\n                type="button"\n                data-testid="list-save-view"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the Save view chip renders whether or not anything is unsaved.')
