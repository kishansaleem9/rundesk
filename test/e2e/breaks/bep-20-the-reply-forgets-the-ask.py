# THE REPLY FORGETS THE ASK: Draft a reply sends the task and drops what was typed.
# Reddens: brain-entry-points: "Draft a reply sends the task and what was asked to /ai/comment-reply, and the panel shows what the server answered, as /ai/status says it will"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                                body: { taskId, workspaceId, instruction: aiPrompt.trim() || undefined },\n"
b = "                                body: { taskId, workspaceId },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bep-20-the-reply-forgets-the-ask: the instruction is not sent')
