# A GUEST'S SHARE COUNTS AS FULL EDIT WHATEVER ITS LEVEL: one given Edit adds tasks.
# Reddens: guest-task-making: "a guest adds a task to a list shared with them at Full edit — and not at Edit (403), nor to a list not shared with them, none made"
#   or "the list page offers the guest Add task and the add rows in the list at Full edit, and neither in the one at Edit"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "      if (hit) return { level: hit.level as SpaceDefaultPermission, source: 'item-share' }\n"
b = "      if (hit) return { level: 'admin' as SpaceDefaultPermission, source: 'item-share' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gtm-2-guest-shares-at-full-edit: applied')
