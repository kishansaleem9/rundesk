# THE PAGE NEVER MAKES THE ROUTE'S DECISION WHEN THE READ ARRIVES LATE: a slow read leaves the member on no tab.
# Reddens: member-settings-tabs: "with the permission read held back 4.5 s, a plain member opening Settings lands on Archived with their three tabs every time, three of three, and nothing throws — the page does not go blank"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    if (!validWorkspaceId || !access.loaded) return\n"
b = "    if (!validWorkspaceId || !access.loaded || Boolean(1)) return\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sbs-2-page-never-decides: done')
