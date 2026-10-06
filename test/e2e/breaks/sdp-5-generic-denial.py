# The 403 stops saying why. A refusal that does not name the space's Default
# permission is indistinguishable from every other Forbidden in the product,
# and the person who set the space to View only has no way to connect the two.
# RE-AIMED 24 September: the refusal has a sentence for a guest with nothing shared,
# and for a guest's share below the space.
# Re-aimed 25 September: the message has a project's branch now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: the refusal names what was refused — changing, adding or deleting (`full-edit-enforced-nowhere`).
# Re-aimed 6 October: a guest is told what is shared below (`found-6-oct/a-guest-shared-one-task-told-nothing-is-shared`).
# Reddens: space-default-permission:
#   "and the refusal says WHY — the space's default permission, not a generic denial"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = '  throw new ForbiddenException(\n    resolved.source === \'guest-default\'\n      ? below\n        ? `Only a ${below} here is shared with you, and a guest changes only what is shared with them`\n        : `Nothing here is shared with you, and a guest changes only what is shared with them`\n      : resolved.source === \'item-share\'\n        ? `What is shared with you here is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? \'changing its\'} ${params.kind}`\n        : resolved.source === \'project-member\'\n          ? `Your access to this project is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? \'changing its\'} ${params.kind}`\n          : resolved.source === \'space-default\'\n            ? `This space\'s default permission is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? \'changing its\'} ${params.kind}`\n            : `Your access to this space is "${LEVEL_LABEL[resolved.level]}", which does not allow ${params.act ?? \'changing its\'} ${params.kind}`,\n  )\n'
b = "  throw new ForbiddenException('Forbidden')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('space-default-permission.ts: the 403 is now a bare "Forbidden" that names nothing.')
