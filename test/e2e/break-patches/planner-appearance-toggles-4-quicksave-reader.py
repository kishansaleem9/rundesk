# Always save quickly, whatever the setting says. The switch still stores `false`; the
# confirmation step it buys is simply never reached.
#
# REDDENS: planner-appearance-toggles.mjs — "with it off, Enter asks instead — and nothing has been posted yet"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const saveQuickly = settings?.savePersonalEventsQuickly !== false'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '  const saveQuickly = true // BREAK: the confirmation step can never be reached'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('forced savePersonalEventsQuickly on, ignoring the stored value')
