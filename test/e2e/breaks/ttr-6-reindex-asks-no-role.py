# REINDEXING ASKS NO ROLE: any member of the workspace, its guests included, re-embeds it.
# Reddens: time-tracking-readers: "a guest of the workspace neither asks its knowledge base nor reindexes it, a member does not reindex it (403 each, nothing indexed) — and its admin does"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/knowledge.controller.ts'
a = "    await this.ai.assertWorkspaceManager(workspaceId, user.id)\n"
b = "    void this.ai\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ttr-6-reindex-asks-no-role: reindexing asks no role")
