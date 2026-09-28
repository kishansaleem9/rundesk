# THE ZOOM ROW CLAIMS A STATE BEFORE ITS LIST ANSWERS: "not connected", with Connect,
# for a person who has connected Zoom.
# Reddens: calendar-accounts: "while its connections list loads, the Zoom row claims neither state and offers no action — then says what the App Center says"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '  const known = connections.isSuccess\n'
b = '  const known = true as boolean\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ca-6-the-row-guesses-while-loading: applied")
