# A SPACE’S DOCS COME IN BESIDE THE WORKSPACE’S, NOT IN THE SPACE.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the Space’s Docs come in it — one in the Space, one in its List — the first page a Doc’s own body and the others under it, as ClickUp nests them; the Workspace’s own Doc stays behind unless asked for"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        if (node.kind === 'space' && node.docs?.length) await this.writeDocs(writer, spaceId, node.docs, madeDocs)\n",
     "        if (node.kind === 'space' && node.docs?.length) await this.writeDocs(writer, spaceId && null, node.docs, madeDocs)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-27-docs-in-no-space: A SPACE’S DOCS COME IN BESIDE THE WORKSPACE’S, NOT IN THE SPACE.')
