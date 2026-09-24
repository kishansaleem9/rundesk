# THE HOLIDAYS AND TIME OFF CALENDARS ARE ON BEFORE THE SETTINGS SAY, as they were.
# Reddens: planner-gates: "with both calendars hidden, a fresh load asks for neither and draws neither — shown, the holiday is asked for and drawn"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '  const settingsKnown = settings !== undefined || settingsFailed\n'
b = '  const settingsKnown = true as boolean\n  void settingsFailed\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgt-1-calendars-on-before-settings: applied")
