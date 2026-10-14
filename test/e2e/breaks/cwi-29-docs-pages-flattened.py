# A DOC’S OTHER PAGES COME IN AS DOCS OF THEIR OWN, NOT UNDER IT.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the Space’s Docs come in it — one in the Space, one in its List — the first page a Doc’s own body and the others under it, as ClickUp nests them; the Workspace’s own Doc stays behind unless asked for"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  walk(top.slice(1), root)\n  return { title, pages: out }\n',
     "  for (const p of top.slice(1)) out.push({ key: `page:${p.id}`, parent: null, title: (p.name ?? '').trim() || 'Untitled', markdown: p.content ?? '' })\n  return { title, pages: out }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-29-docs-pages-flattened: A DOC’S OTHER PAGES COME IN AS DOCS OF THEIR OWN, NOT UNDER IT.')
