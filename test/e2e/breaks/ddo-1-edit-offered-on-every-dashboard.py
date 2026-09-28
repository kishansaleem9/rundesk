# THE BUILDER OFFERS EDIT DASHBOARD ON EVERY DASHBOARD, as before.
# Reddens: dashboard-own-copy: "on the admin’s workspace default a plain member is offered Make my own copy, not Edit dashboard, which they could not save"
import io
p = '/home/user/rundesk/apps/web/src/components/dashboard-widget-builder.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const owns = !preset?.id || preset.isOwner !== false\n'
b = '  const owns = !preset?.id || preset.isOwner !== false || Boolean(1)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ddo-1-edit-offered-on-every-dashboard: done')
