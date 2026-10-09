# A WORKSPACE’S OWNER READS ANYBODY’S PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "it is hers alone: Max, the guest and the workspace’s owner are each refused its task and its list by id, and search finds it for none of them — it does for her"
#
# The manager’s pass reaches Personal Lists again: by id, in search, in every read that asks the filters.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/item-visibility.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (item.personalOf) return item.personalOf === actor.userId\n',
     '  if (item.personalOf && !actor.isManager) return item.personalOf === actor.userId // BROKEN: managers pass\n'),
    ('  if (isManager) return notInOthersPersonalList(db, actorId)\n',
     '  if (isManager) return undefined // BROKEN: managers pass\n'),
    ('  if (isManager) return personalListOpenTo(actorId)\n',
     '  if (isManager) return undefined // BROKEN: managers pass\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (isManager) {\n    return notInArray(\n      tasks.listId,\n      db.select({ id: lists.id }).from(lists).where(and(isNotNull(lists.personalOf), ne(lists.personalOf, actorId))),\n    )\n  }\n',
     '  if (isManager) return undefined // BROKEN: managers pass\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-3-managers-read-anyones-personal-list: A WORKSPACE’S OWNER READS ANYBODY’S PERSONAL LIST.')
