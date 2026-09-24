# THE ROW OFFERS CONNECT WHILE IT IS STILL CHECKING, though it claims no state.
# Reddens: calendar-accounts: "while its connections list loads, the Zoom row claims neither state and offers no action"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '        {!known ? null : connected ? (\n'
b = '        {connected ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ca-7-an-action-while-checking: applied")
