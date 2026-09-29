# A LIVE WORKSPACE IS DELETED FOR GOOD: the archive step, the one that can be undone, is skipped.
# Reddens: workspace-delete-for-good: "the route refuses an admin who does not own its organization, a workspace that is not archived, and a name typed wrong — and the workspace stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "    if (!ws.isArchived) throw new BadRequestException('Archive the workspace first: only an archived workspace is deleted for good')\n"
b = "    if (!ws.isArchived && Boolean(0)) throw new BadRequestException('Archive the workspace first: only an archived workspace is deleted for good')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-4-live-workspace-deleted: applied")
