# THE MIRROR DEFECT. The doc is created BEFORE the draft is asked for, so a
# refused AI call leaves an empty doc in the workspace -- a row in the database
# standing as evidence for a feature that never ran.
# Reddens: task-ai-bar -- 'a refused draft left NO doc behind'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """      const drafted = await api<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: { taskId, type: 'task', workspaceId },
      })
      const body = (drafted?.summary ?? '').trim()
      if (!body) throw new Error(t('taskAiBar.emptyDraft'))

      const doc = await api<{ id: string }>(`/workspaces/${workspaceId}/docs`, {
        method: 'POST',
        body: { title: t('taskAiBar.docTitle', { title }) },
      })"""
b = """      const doc = await api<{ id: string }>(`/workspaces/${workspaceId}/docs`, {
        method: 'POST',
        body: { title: t('taskAiBar.docTitle', { title }) },
      })
      const drafted = await api<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: { taskId, type: 'task', workspaceId },
      })
      const body = (drafted?.summary ?? '').trim()
      if (!body) throw new Error(t('taskAiBar.emptyDraft'))"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the AI bar now creates the doc before it asks for the draft.")
