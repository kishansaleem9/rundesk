# ANY MEMBER DELETES A WORKSPACE FOR GOOD: the owner rule is not asked.
# Reddens: workspace-delete-for-good: "the route refuses an admin who does not own its organization, a workspace that is not archived, and a name typed wrong — and the workspace stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
# Re-anchored 2 November: the owner is asked as `actsAsOwner` — the workspace's
# owner, an owner of its organization, a platform admin (`found-02-nov/workspace-has-no-owner`).
a = "    if (!(await this.actsAsOwner(ws, actor))) throw new ForbiddenException('Only the workspace’s owner deletes it for good')\n"
b = "    if (!(await this.actsAsOwner(ws, actor)) && Boolean(0)) throw new ForbiddenException('Only the workspace’s owner deletes it for good')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-3-any-member-deletes: applied")
