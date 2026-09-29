# NOBODY IS OFFERED DELETE FOR GOOD: the route is there and the page never asks it.
# Reddens: workspace-delete-for-good: "the owner of the workspace’s organization is offered Delete for good on the archived workspace, and an admin of it who owns no organization of it is not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '              {entry.mayDeleteForGood && (\n'
b = '              {Boolean(0) && entry.mayDeleteForGood && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-2-not-offered-at-all: applied")
