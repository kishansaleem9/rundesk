# A ROUTE NAMING THE WORKSPACE LOOKS IT UP (by its spaces), so a non-member is told 404 for an id naming no
# workspace and 403 for this one: the answer says which ids are workspaces.
# Reddens: refused-as-forbidden: "a route naming the workspace itself refuses a stranger 403 — alike for this workspace and for an id naming none, since it is not looked up — and names nothing in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = "    if (kind === 'ws') return { workspaceId: id }\n"
b = "    if (kind === 'ws') {\n      const [r] = await this.db.select({ w: spaces.workspaceId }).from(spaces).where(eq(spaces.workspaceId, id)).limit(1)\n      return r ? { workspaceId: id } : null\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-12-the-workspace-is-looked-up: a named workspace is looked up')
