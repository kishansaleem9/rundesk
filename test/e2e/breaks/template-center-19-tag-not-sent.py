# CHOOSING A TAG NEVER LEAVES THE BROWSER (`ledger-rows/row-1874`).
#
# The Tags menu holds the choice and the page never puts `tag=` on the browse
# request: counts that look right beside a filter that does nothing.
#
# Reddens: template-center: "and tag=Q3 went to the server"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "    if (tag) p.set('tag', tag)\n"
b = "    // BROKEN: tag never sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-19-tag-not-sent: no browse request carries tag=')
