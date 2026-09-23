# A THREAD YOU HAVE TO RELOAD TO READ, which is the page you already had. The
# reply is stored correctly and the panel never asks again, so the box clears,
# nothing appears, and the only evidence the reply exists is a refresh.
# Reddens: comment-thread: "it appears in the thread without leaving it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      setBody('')\n      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
b = "      setBody('')\n    },\n  })\n\n  return (\n    <div className=\"space-y-3\" data-testid=\"comment-thread-panel\""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread never refetches after a reply.')
