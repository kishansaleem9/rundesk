# DELETE SENT WHERE NOTHING ANSWERS: the row stays, and the list with it.
# Reddens: home-reminders: "deleting one takes it off the list and out of the database"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = "    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/reminders/${id}`, { method: 'DELETE' }),\n"
b = "    mutationFn: (id: string) => api(`/reminders/${id}`, { method: 'DELETE' }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-8-delete-wrong-route: applied")
