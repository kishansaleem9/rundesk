# EVERY LIST'S EXPORT IS SAVED AS "list.csv" (`found-30-sep/list-export-saved-as-list-csv`): the page names the
# file itself, as it did, whatever the list is called and whatever the server named it.
# Reddens: list-export: "and Download saves the export under the list’s name, as the server names it — not list.csv"
#   "and a list named in another script is saved under its whole name too"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      await downloadFile(`/tasks/list/${listId}/export?${query.toString()}`)\n"
b = "      await downloadFile(`/tasks/list/${listId}/export?${query.toString()}`, `list.${format === 'xlsx' ? 'xlsx' : 'csv'}`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-2-every-list-is-saved-as-list-csv: the page saves every export as list.csv')
