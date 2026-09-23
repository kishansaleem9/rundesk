# A THREAD YOU HAVE TO RELOAD TO READ, which is the page you already had. The
# reply is stored correctly, the box clears, and nothing appears.
#
# IT TOOK THREE TRIES TO AIM, and both misses are worth writing down because
# both reddened NOTHING while looking like a broken refresh:
#
#   1. Cutting only the panel's own `invalidateQueries`. A realtime
#      `comment.*` event invalidates the same query from the task
#      subscription half a second later, so the check passed for a perfectly
#      good reason.
#   2. Cutting that socket branch too. Still green — because the line ABOVE it
#      invalidates `['task', taskId]`, and TanStack Query matches query keys
#      BY PREFIX. `['task', taskId]` already includes
#      `['task', taskId, 'comments']`, so the specific call was never the one
#      doing the work.
#
# So the socket ignores comment events entirely, which is the only way to leave
# nothing refreshing the panel. A patch that disproves no check is worse than
# no patch, because a row credits it.
# Reddens: comment-thread: "it appears in the thread without leaving it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()

a = "      setBody('')\n      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
b = "      setBody('')\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
assert s.count(a) == 1, f'panel anchor appears {s.count(a)} times in {p}, expected exactly 1'

c = "      if (event.taskId !== taskId) return"
d = "      if (event.taskId !== taskId || event.type.startsWith('comment.')) return"
assert s.count(c) == 1, f'socket anchor appears {s.count(c)} times in {p}, expected exactly 1'

io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))
print('task-detail-sheet.tsx: nothing refreshes the comments after a reply — not the panel, not the socket, not the prefix.')
