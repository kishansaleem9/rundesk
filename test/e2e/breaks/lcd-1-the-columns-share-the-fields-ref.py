# THE COLUMNS PANEL CARRIES THE FIELDS PICKER'S REF AGAIN, as it did (`found-6-oct/columns-panel-stays-open-beside-the-fields-picker`): the ref ends on
# the picker, so the panel stays open after a press outside it and after Escape.
# Reddens: list-view-controls: "the Columns panel and the Fields picker beside it each close on a press outside it and on Escape"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '              <details ref={columnsDetailsRef} className="relative" data-testid="list-columns">\n'
b = '              <details ref={fieldsDetailsRef} className="relative" data-testid="list-columns">{/* BROKEN: one ref for two panels */}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lcd-1-the-columns-share-the-fields-ref: the Columns panel shares the Fields picker's ref")
