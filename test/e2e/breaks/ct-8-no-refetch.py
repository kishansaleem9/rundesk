# A THREAD YOU HAVE TO RELOAD TO READ, which is the page you already had. The
# reply is stored correctly, the box clears, and nothing appears.
#
# FOUR AIMS MISSED BEFORE THIS ONE, AND THE MISSES ARE THE POINT OF THE HEADER.
# Each looked exactly like a broken refresh and each reddened NOTHING, because
# this one query is refreshed from more places than any one of them suggests:
#
#   1. The panel's own `invalidateQueries` after the reply. Cut it and the
#      socket handlers still do the work.
#   2. `task-detail-sheet.tsx`'s task-room handler — and cutting its
#      `['task', taskId, 'comments']` line was not enough either, because the
#      line above invalidates `['task', taskId]` and TanStack Query matches
#      query keys BY PREFIX. The specific call was never the one working.
#   3. The LIST ROUTE's own handler, which subscribes to `list:<id>` and
#      invalidates the same three task keys again. Nothing in the task sheet
#      mentions it.
#   4. And the event is not called what it looks like. Guarding on
#      `event.type.startsWith('comment.')` changed nothing, because posting a
#      comment emits **`activity.created`** and the handler's second clause
#      catches it there. Found by wrapping `queryClient.invalidateQueries` in
#      a logger and reading the stack, after three aims taken by reading the
#      code instead.
#
# The redundancy is not a defect — it is why a reply appears whichever surface
# you are on. It does mean this check can only be reddened by removing the live
# refresh for this task entirely, which is a coherent state: a build with the
# realtime wiring gone.
# Reddens: comment-thread: "it appears in the thread without leaving it"
import io
tds = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
lst = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'

s = io.open(tds, encoding='utf-8').read()
a = "      setBody('')\n      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
b = "      setBody('')\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
assert s.count(a) == 1, f'panel anchor appears {s.count(a)} times in {tds}, expected exactly 1'

c = """      if (event.taskId !== taskId) return
      void qc.invalidateQueries({ queryKey: ['task', taskId] })
      if (event.type.startsWith('comment.') || event.type === 'activity.created') {
        void qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
        void qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
      }"""
d = "      if (event.taskId !== taskId) return"
assert s.count(c) == 1, f'task socket anchor appears {s.count(c)} times in {tds}, expected exactly 1'
io.open(tds, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))

t = io.open(lst, encoding='utf-8').read()
e = "        if (event.taskId) {\n          void qc.invalidateQueries({ queryKey: ['task', event.taskId] })\n          void qc.invalidateQueries({ queryKey: ['task', event.taskId, 'comments'] })\n          void qc.invalidateQueries({ queryKey: ['task', event.taskId, 'activity'] })\n        }"
f = "        if (false) {\n          void qc.invalidateQueries({ queryKey: ['task', event.taskId ?? ''] })\n        }"
assert t.count(e) == 1, f'list-route anchor appears {t.count(e)} times in {lst}, expected exactly 1'
io.open(lst, 'w', encoding='utf-8').write(t.replace(e, f))

print('task-detail-sheet.tsx + $listId.tsx: nothing left refreshes this task\'s comments.')
