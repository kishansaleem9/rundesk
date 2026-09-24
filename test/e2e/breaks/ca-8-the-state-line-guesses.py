# THE ROW'S STATE LINE SAYS "CONNECT ZOOM" WHILE IT IS STILL CHECKING.
# Reddens: calendar-accounts: "while its connections list loads, the Zoom row claims neither state and offers no action"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = "            {!known\n              ? connections.isError\n                ? t('plannerSettings.conferencing.checkFailed')\n                : t('plannerSettings.conferencing.checking')\n              : connected\n"
b = '            {connected\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ca-8-the-state-line-guesses: applied")
