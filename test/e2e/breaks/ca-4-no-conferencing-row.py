# The Conferencing section leaves the Accounts page, which is the state the ledger
# recorded as `M | Conferencing / Zoom connect row`.
# Reddens: calendar-accounts: "the Accounts page ends in a Conferencing section with a Zoom row"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '                <ConferencingRow workspaceId={workspaceId} />\n'
b = '                {null}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-settings-dialog.tsx: the Conferencing row is gone.')
