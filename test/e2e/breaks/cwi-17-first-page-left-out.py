# A DOC COMES IN WITHOUT ITS FIRST PAGE’S BODY.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the Space’s Docs come in it — one in the Space, one in its List — the first page a Doc’s own body and the others under it, as ClickUp nests them; the Workspace’s own Doc stays behind unless asked for"
#   or "the run brings the rest of the Workspace and says so: four pages of Docs, one time entry made and one held for somebody invited, one Goal"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const out: ImDocPage[] = [{ key: root, parent: null, title, markdown: first?.content ?? '' }]\n",
     "  const out: ImDocPage[] = [{ key: root, parent: null, title, markdown: '' }]\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-17-first-page-left-out: A DOC COMES IN WITHOUT ITS FIRST PAGE’S BODY.')
