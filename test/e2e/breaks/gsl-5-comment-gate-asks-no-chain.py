# A COMMENT PASSES NO CHAIN: a guest given one task, or its list, to comment on
# is refused, since only the space is asked.
# Reddens: guest-space-level: "where only an item is shared with a guest, its level is theirs there — they comment on the shared task and in the shared list, and make a list in the shared project — and not on the task beside them"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """      within: [
        { type: 'task', id: taskId },
        { type: 'list', id: row.listId },
        { type: 'project', id: row.projectId },
        ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : []),
      ],
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-5-comment-gate-asks-no-chain: the comment gate asks the space alone')
