# Always project recurrences. The Time-blocking switch still writes `showRecurring: false`
# and the grid carries on drawing the forecast — the exact shape this key had before the
# item: written, stored, honoured by nothing.
#
# REDDENS: planner-appearance-toggles.mjs — "turning it off removes every projection and leaves the real blocks alone"
#
# Reddens: planner-appearance-toggles: "turning it off removes every projection and leaves the real blocks alone"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const showRecurring = settings?.showRecurring !== false'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '  const showRecurring = true // BREAK: the switch stores a value nothing reads'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('forced showRecurring on, ignoring the stored value')
