# Coalescing that UPDATES the kept row instead of leaving it alone. Three quick
# edits still produce one entry — so the count check passes — and the entry now
# holds the second-to-last text rather than the oldest, so the original brief is
# gone while the history still looks like a history.
#
# This is the pair to `task-menu-2`: one breaks the count, this breaks the
# CONTENT while the count stays right, and a suite that only counted entries
# would be green for it.
#
# Reddens: task-menu:
#   "and the entry kept is the OLDEST text, not the most recent one"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (latest && latest.editorId === editorId && withinWindow) return\n'
b = """    if (latest && latest.editorId === editorId && withinWindow) {
      await this.db
        .update(taskDescriptionRevisions)
        .set({ description: previous })
        .where(eq(taskDescriptionRevisions.id, latest.id))
      return
    }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: coalescing overwrites the kept entry with the newer text.')
