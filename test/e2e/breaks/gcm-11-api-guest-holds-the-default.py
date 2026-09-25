# A GUEST WITH NOTHING SHARED IN A SPACE HOLDS ITS DEFAULT AGAIN — the
# members' level — so the API makes them a list where they only pass
# through, which no menu offers.
# Reddens: guest-create-menu: "the API makes the guest what the menus offer — a reminder, a list in the space with Full edit — and refuses what they withhold: a list where they pass through, a task, a workspace doc, a whiteboard, a form"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "  if (guest) return { level: 'view', source: 'guest-default' }\n  return { level: space.defaultPermission, source: 'space-default' }\n"
b = "  return { level: space.defaultPermission, source: 'space-default' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-11-api-guest-holds-the-default: a guest holds the space default')
