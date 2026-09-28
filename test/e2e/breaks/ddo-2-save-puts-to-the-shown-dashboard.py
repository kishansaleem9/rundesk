# SAVING PUTS TO WHATEVER DASHBOARD IS SHOWN, which only its owner may change.
# Reddens: dashboard-own-copy: "saving it makes the member a dashboard of their own with that layout (201), asks nothing of the admin’s, and leaves the admin’s as it was"
import io
p = '/home/user/rundesk/apps/web/src/components/dashboard-widget-builder.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      if (preset?.id && owns) {\n'
b = '      if (preset?.id) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ddo-2-save-puts-to-the-shown-dashboard: done')
