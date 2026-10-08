# A TEMPLATE FROM ANY DOC OF THE WORKSPACE, as it was: the whole body copied where every member reads it.
# Reddens: workspace-read-access: "a member cannot edit, comment on, export or template a doc they may not open (403 “This space or project is private” each, the doc unchanged, nothing made) — while they edit an open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    const doc = await this.assertDocAccess(docId, userId)\n    if (doc.workspaceId !== workspaceId) throw new NotFoundException('Doc not found in this workspace')\n"
b = "    const [doc] = await this.db.select().from(docs).where(eq(docs.id, docId)).limit(1)\n    if (!doc || doc.workspaceId !== workspaceId) throw new NotFoundException('Doc not found in this workspace')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-51-template-any-doc: applied")
