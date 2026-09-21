# The row stops reading the connection the App Center writes and keeps its own
# answer. Two surfaces disagreeing about whether an integration somebody relies
# on is live — and the calendar page is the one that would be believed.
# Reddens: calendar-accounts: "the row agrees with the App Center"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = "  const connected = (connections.data ?? []).some(\n    (c) => c.provider === 'zoom' && c.status === 'connected',\n  )\n"
b = '  const connected = false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-settings-dialog.tsx: the Zoom row keeps its own connection state.')
