# THE PICKER DRAWS NO OPTION FOR A CHOSEN LIST IN THE TRASH, as it did not: the deleted Default list is shown as
# "My Personal List", and choosing that saves nothing.
# Re-claimed 9 October: the empty choice reads “My Personal List”, where a task with no list chosen goes (`found-24-sep/planner-default-list-read-by-nothing`).
# Reddens: planner-default-list: "and the picker it sends them to shows the deleted choice as a list in the trash, not “My Personal List” — which it shows in another workspace, where /task passes that list over — and choosing that saves it, so /task lands in the Personal List again"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '  const chosenInTrash =\n    listsLoaded && settings?.defaultListInTrash === true && !!settings.defaultListId\n'
b = '  const chosenInTrash =\n    false && listsLoaded && settings?.defaultListInTrash === true && !!settings.defaultListId\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdl-8-the-picker-draws-no-choice-in-the-trash: the picker draws no choice in the trash')
