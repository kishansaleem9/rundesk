# CHOOSING A MAKER NEVER LEAVES THE BROWSER (`ledger-rows/row-1874`).
#
# The menu holds the choice and the page never puts `createdBy=` on the browse
# request, so the grid does not narrow: the menu is a control wired to nothing.
#
# Reddens: template-center: "and createdBy=<their id> went to the server"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "    if (createdBy) p.set('createdBy', createdBy)\n"
b = "    // BROKEN: createdBy never sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-14-created-by-not-sent: no browse request carries createdBy=')
