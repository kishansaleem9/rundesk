# THE WORKLOAD IS COUNTED WORKSPACE-WIDE WHOEVER ASKS, as it was.
# Reddens: ai-read-access: "workload balance counts, for a member, only tasks they may open, and hands out no id of another — the admin’s counts all nine"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    const seen = reader ? await this.readerTaskFilter(workspaceId, reader) : undefined\n'
b = '    const seen: SQL | undefined = undefined\n    void reader\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-4-loads-ignore-the-reader: applied")
