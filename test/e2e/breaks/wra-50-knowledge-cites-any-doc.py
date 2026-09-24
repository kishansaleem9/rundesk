# THE KNOWLEDGE ANSWER WITH NO DOC RULE: it cites every doc the vectors rank.
# Reddens: workspace-read-access: "the knowledge answer cites no doc the member may not open, nor the page under one — while it cites the page shared with them, and the admin’s cites the private page"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '            const hidden = new Set(await hiddenDocIds(this.db, workspaceId, userId, false))\n'
b = '            const hidden = new Set<string>()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-50-knowledge-cites-any-doc: applied")
