# The 403 stops saying why. A refusal that does not name the space's Default
# permission is indistinguishable from every other Forbidden in the product,
# and the person who set the space to View only has no way to connect the two.
# RE-AIMED 24 September: the refusal has a sentence for a guest with nothing shared,
# and for a guest's share below the space.
# Re-aimed 25 September: the message has a project's branch now (`project-roles-narrow-nothing`).
# Reddens: space-default-permission:
#   "and the refusal says WHY — the space's default permission, not a generic denial"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = """  throw new ForbiddenException(
    resolved.source === 'guest-default'
      ? `Nothing here is shared with you, and a guest changes only what is shared with them`
      : resolved.source === 'item-share'
        ? `What is shared with you here is "${LEVEL_LABEL[resolved.level]}", which does not allow changing its ${params.kind}`
        : resolved.source === 'project-member'
          ? `Your access to this project is "${LEVEL_LABEL[resolved.level]}", which does not allow changing its ${params.kind}`
          : resolved.source === 'space-default'
            ? `This space's default permission is "${LEVEL_LABEL[resolved.level]}", which does not allow changing its ${params.kind}`
            : `Your access to this space is "${LEVEL_LABEL[resolved.level]}", which does not allow changing its ${params.kind}`,
  )
"""
b = """  throw new ForbiddenException('Forbidden')
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('space-default-permission.ts: the 403 is now a bare "Forbidden" that names nothing.')
