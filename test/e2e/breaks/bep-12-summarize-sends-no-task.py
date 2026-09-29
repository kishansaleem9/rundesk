# SUMMARIZE THIS TASK ASKS FOR A SUMMARY OF NOTHING.
#
# The mode is offered, the box says the summary is drafted from the task, and
# the request goes to the right route without the task's id — so the server
# has no task to read and summarises an empty input. With no model the answer
# is the same refusal either way, so only the request body can tell the two
# apart; that is where the check looks.
#
# Reddens: brain-entry-points: "asked to Summarize this task, the panel sends this task’s id to /ai/summarize — the task is what it drafts from, not a typed instruction"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """
                            await api<{ summary: string }>('/ai/summarize', {
                              method: 'POST',
                              body: { taskId, type: 'task', workspaceId },
"""
b = """
                            await api<{ summary: string }>('/ai/summarize', {
                              method: 'POST',
                              body: { type: 'task', workspaceId },
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the comment panel\'s Summarize this task sends no task.')
