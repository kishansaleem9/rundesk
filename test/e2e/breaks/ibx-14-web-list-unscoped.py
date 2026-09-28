# THE INBOX PAGE ASKS WITHOUT ITS WORKSPACE: the server answers with all of them.
# Reddens: inbox-scope: "scrolling to the end loads the rest — 59 rows, the oldest included — and \"Load older\" goes away"Load older"scrolling to the end loads the rest — 59 rows, the oldest included — and \"Load older\" goes away"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-inbox-page.tsx'
a = '    { workspaceId, view, types: chipTypes },\n'
b = '    { view, types: chipTypes },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-14-web-list-unscoped: applied")
