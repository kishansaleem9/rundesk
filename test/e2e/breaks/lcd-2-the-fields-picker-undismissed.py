# THE FIELDS PICKER IS NOT DISMISSED: no press outside it and no Escape closes it (`found-6-oct/columns-panel-stays-open-beside-the-fields-picker`, the other panel).
# Reddens: list-view-controls: "the Columns panel and the Fields picker beside it each close on a press outside it and on Escape"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "  useDismissableDetails(fieldsDetailsRef)\n"
b = "  // BROKEN: the Fields picker is not dismissed\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lcd-2-the-fields-picker-undismissed: the Fields picker closes on nothing")
