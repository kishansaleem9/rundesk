# A LIST UNDER ITS OWN KEY: it reads the reminders, but the modal refreshes
# ['reminders', ws], so a reminder made there does not appear until a reload.
# Reddens: home-reminders: "the reminder made in the modal is stored and appears in the list without a reload"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
a = "    queryKey: ['reminders', workspaceId],\n    enabled: Boolean(workspaceId),\n    queryFn: () => api<PendingReminder[]>("
b = "    queryKey: ['home-reminders', workspaceId],\n    enabled: Boolean(workspaceId),\n    queryFn: () => api<PendingReminder[]>("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-2-list-on-another-key: applied")
