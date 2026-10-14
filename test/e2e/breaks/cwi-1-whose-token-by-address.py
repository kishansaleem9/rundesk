# WHOSE TOKEN IT IS IS SAID BY ITS ADDRESS, NOT ITS NAME.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "the ClickUp tab takes a personal API token: one ClickUp refuses is said in the form and nothing is kept; the right one signs in, kept sealed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const name = me.user?.username || me.user?.email || 'ClickUp'\n",
     "    const name = me.user?.email || 'ClickUp'\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-1-whose-token-by-address: WHOSE TOKEN IT IS IS SAID BY ITS ADDRESS, NOT ITS NAME.')
