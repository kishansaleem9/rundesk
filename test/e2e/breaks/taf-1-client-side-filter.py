# THE PATCH THIS ROW EXISTS FOR — the panel asks the old unparameterised
# endpoint and narrows the array it already has. That array is the hundred most
# recent entries, so every older match reads as "nothing matches": the
# confident zero, indistinguishable in the UI from a true absence.
# Reddens: task-activity-filter: "typing the needle narrows the feed to the single matching entry"
#   or "and it went out as a request carrying `q=` — the server did the narrowing"
#   or "and the single row drawn is the year-old `commented` entry the search was for"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        const params = new URLSearchParams()
        if (search.trim()) params.set('q', search.trim())
        if (actionFilter) params.set('action', actionFilter)
        const qs = params.toString()
        return await api<ActivityEntry[]>(`/tasks/${taskId}/activity/search${qs ? `?${qs}` : ''}`)"""
b = """        const all = await api<ActivityEntry[]>(`/tasks/${taskId}/activity`)
        const needle = search.trim().toLowerCase()
        return all.filter(
          (row) =>
            (!actionFilter || row.action === actionFilter) &&
            (!needle || JSON.stringify(row.meta ?? {}).toLowerCase().includes(needle)),
        )"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the activity filter now narrows the loaded array instead of asking the server.")
