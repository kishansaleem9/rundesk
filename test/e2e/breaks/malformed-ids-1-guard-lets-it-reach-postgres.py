# The shape check is removed from `ResourceMemberGuard`, so a path param that
# cannot be a uuid goes straight into a `where` clause.
#
# This is the state the suite was written against, restored: `/spaces/dashboards`
# reaches `where spaces.id = 'dashboards'`, Postgres answers `22P02 invalid
# input syntax for type uuid`, and `AllExceptionsFilter` turns that into the
# generic 400 "A value has an invalid format".
#
# WHY THE STATUS CODE DOES NOT MOVE, and why that is the point. Both the guarded
# and the unguarded build answer 400 here — the difference is WHO produced it,
# which is why the assertion is `status === 400 && message !== DATABASE_REFUSED`
# rather than a status check. A patch that reddened the status would prove
# nothing about the half of the check that matters; this one leaves the status
# alone and moves only the origin.
#
# The `isUuid` import is left unused rather than removed: the API build has no
# `noUnusedLocals`, and a patch that also edits the import list is a patch whose
# failure mode includes "the import was wrong".
#
# Reddens: malformed-ids: "is turned away before the database"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = """      if (!isUuid(id)) throw new BadRequestException(`Malformed ${kind} id`)
      return this.resolveByKind(kind, id, actorId)
"""
b = """      return this.resolveByKind(kind, id, actorId)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('resource-member.guard.ts: a malformed path id now reaches Postgres instead of being turned away.')
