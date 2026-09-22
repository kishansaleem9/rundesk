# The type facet filtered IN THE BROWSER and the parameter never sent. The grid
# still narrows to five, the cards are still all folders, and nothing left the
# page — which is exactly the shape this suite exists to catch.
#
# Reddens: template-center: "and the page asked the SERVER for them"
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="    if (types.length) p.set('type', types.join(','))\n"
b="  const templates = useMemo(() => browseQuery.data?.templates ?? [], [browseQuery.data])"
assert s.count(a)==1, 'query-string anchor not found exactly once'
assert s.count(b)==1, 'templates anchor not found exactly once'
s=s.replace(a,'')
s=s.replace(b,
  "  const templates = useMemo(\n"
  "    () => (browseQuery.data?.templates ?? []).filter((tpl) => types.length === 0 || types.includes(tpl.targetType)),\n"
  "    [browseQuery.data, types],\n"
  "  )")
io.open(p,'w',encoding='utf-8').write(s)
print('BREAK 3: type= no longer leaves the browser; the page filters its own array instead')
