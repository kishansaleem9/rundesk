# THE IMPORT PAGE HAS NO TAB FOR THE TOOLS SIGNED IN TO.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "the import page has a tab of the seven tools — Asana, Jira, Monday, Notion, Todoist, Trello, Wrike — each set up on this server and signed in to by nobody yet; a member without the Import data permission is offered none of them"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          testid="import-tab-apps"\n',
     '          testid="import-tab-apps-gone"\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-w1-no-apps-tab: THE IMPORT PAGE HAS NO TAB FOR THE TOOLS SIGNED IN TO.')
