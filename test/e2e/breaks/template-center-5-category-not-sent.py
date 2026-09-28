# The category drill-in done as a client-side slice: the section still expands
# to seven, and the server was never told which category anybody was looking at.
#
# Reddens: template-center: "and category=engineering went to the server — it is a query, not a client-side slice"
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="    if (category) p.set('category', category)\n"
b="  const templates = useMemo(() => browseQuery.data?.templates ?? [], [browseQuery.data])"
assert s.count(a)==1, 'query-string anchor not found exactly once'
assert s.count(b)==1, 'templates anchor not found exactly once'
s=s.replace(a,'')
s=s.replace(b,
  "  const templates = useMemo(\n"
  "    () => (browseQuery.data?.templates ?? []).filter((tpl) => !category || (tpl.category ?? 'other') === category),\n"
  "    [browseQuery.data, category],\n"
  "  )")
io.open(p,'w',encoding='utf-8').write(s)
print('BREAK 5: category= no longer leaves the browser; the drill-in is a local slice')
