# A REMOVAL THAT ONLY HAPPENED IN THE BROWSER. The DELETE is dropped and the
# list is invalidated anyway, so the card disappears, the toast is silent, and
# the file comes back on the next load.
# Reddens: task-attachments -- 'Remove took it off the server too'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    mutationFn: (attachmentId: string) => api(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),"""
b = """    mutationFn: async (attachmentId: string) => {
      qc.setQueryData(['task', taskId, 'attachments'], (prev: any) =>
        Array.isArray(prev) ? prev.filter((row: any) => row.id !== attachmentId) : prev,
      )
      return { id: attachmentId }
    },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: removing an attachment no longer reaches the server.")
