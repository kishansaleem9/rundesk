# A THREAD YOU HAVE TO RELOAD TO READ, which is the page you already had. The
# reply is stored correctly, the box clears, and nothing appears.
#
# IT HAS TO CUT BOTH PATHS, and the first version of this patch cut only one
# and reddened nothing. The panel invalidates the comments query itself AND a
# realtime `comment.*` event invalidates it again from the task subscription,
# so removing the panel's own call leaves the socket refreshing it half a
# second later and the check passes for a perfectly good reason. A patch that
# proves nothing is worse than no patch, because a row credits it.
# Reddens: comment-thread: "it appears in the thread without leaving it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()

a = "      setBody('')\n      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
b = "      setBody('')\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
assert s.count(a) == 1, f'panel anchor appears {s.count(a)} times in {p}, expected exactly 1'

c = "      if (event.type.startsWith('comment.') || event.type === 'activity.created') {\n        void qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })"
d = "      if (event.type === 'activity.created') {"
assert s.count(c) == 1, f'socket anchor appears {s.count(c)} times in {p}, expected exactly 1'

io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))
print('task-detail-sheet.tsx: nothing refreshes the comments after a reply — not the panel, not the socket.')
