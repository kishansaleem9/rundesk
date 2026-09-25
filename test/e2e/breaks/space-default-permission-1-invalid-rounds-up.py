# The create path goes back to rounding an unknown default permission up to
# `edit`, which is what it did until 21 September.
#
# It answers 201 with a valid-looking row, so a typo in any client — or a
# constant renamed on one side of the wire — silently grants the most
# permissive of the three permissions the wizard offers. The UPDATE path
# refused the same value all along with "invalid defaultPermission": one value,
# two answers, and the widening one was the silent one.
#
# Probed both ways against a live API before the fix:
#
#     CREATE defaultPermission:"nonsense"   201, stored as "edit"
#     PUT    defaultPermission:"nonsense"   400, "invalid defaultPermission"
#
# Re-aimed 25 September: Full edit is asked where it was offered (`full-edit-enforced-nowhere`).
# Reddens: space-default-permission:
#   "a default permission that is not one of the four is refused on CREATE"
#   "and no space is created with the value rounded up to Full edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = "    if (\n      data.defaultPermission !== undefined &&\n      !SPACE_PERMISSIONS.includes(data.defaultPermission as SpaceDefaultPermission)\n    ) {\n      throw new BadRequestException('invalid defaultPermission')\n    }\n    const permission: SpaceDefaultPermission =\n      (data.defaultPermission as SpaceDefaultPermission | undefined) ?? 'admin'\n"
b = "    const permission: SpaceDefaultPermission = SPACE_PERMISSIONS.includes(\n      data.defaultPermission as SpaceDefaultPermission,\n    )\n      ? (data.defaultPermission as SpaceDefaultPermission)\n      : 'admin'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: an unknown default permission is rounded up to edit again.')
