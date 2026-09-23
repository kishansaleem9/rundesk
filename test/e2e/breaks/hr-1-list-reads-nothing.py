# THE LIST WITH NO READER, as it was: the section is drawn and asks nobody.
# Reddens: home-reminders: "the reminder made in the modal is stored and appears in the list without a reload"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = '    queryFn: () => api<PendingReminder[]>(`/workspaces/${workspaceId}/reminders`),\n'
b = '    queryFn: () => Promise.resolve([] as PendingReminder[]),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-1-list-reads-nothing: applied")
