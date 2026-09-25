# The bin guard logs the attempt and lets the write through.
#
# THE STALE REASON, WITH THE GUARD STILL IN PLACE. `assertNotInBin` is still
# called from all thirty-odd write paths, still takes the same argument, still
# has its whole nineteen-line comment explaining why 409 is the right answer and
# why silence is the wrong one. It just no longer throws. From a call site — and
# there are thirty of them — nothing has changed at all.
#
# The plausible route is an incident: somebody's integration starts 409-ing
# after a bulk delete, and turning the refusal into a warning is the one-line
# change that stops the pager. The log line even reads like diligence.
#
# The comment is the specification and it says what this costs: "the edit
# appears to succeed, and then the row is purged out from under it thirty days
# later along with whatever was written." Nothing in the app can reach a binned
# task, so the population that hits this is a stale tab, a queued request, a
# script — exactly the callers who cannot see the bin and will not find out.
#
# THREE CHECKS, AND THE THIRD IS THE ONE THAT MAKES THE SET HONEST. Refusing
# the edit and refusing the comment both fail, and so does `and wrote nothing
# while refusing` — which exists because a 409 over a write that landed is
# worse than no guard at all. Here there is no 409 and the write lands, so the
# suite reports both halves separately.
#
# The two operations that exist FOR binned tasks are untouched: restore still
# works, editing after restore still works, and re-deleting is still not an
# error. Those three pass, which is what tells a reader the guard was widened
# rather than removed.
#
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Reddens: task-depth: "and refuses edits once it is in the bin" and
#   "and refuses comments too" and "and wrote nothing while refusing"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "export function assertTaskNotInBin(isArchived: boolean | null | undefined) {\n  if (isArchived) {\n    throw new ConflictException('This task is in the bin. Restore it before editing.')\n  }\n}\n"
b = "export function assertTaskNotInBin(isArchived: boolean | null | undefined) {\n  if (isArchived) {\n    // Warn rather than refuse: a caller holding an id from before a bulk\n    // delete should not have its writes rejected outright.\n    console.warn('write to a task that is in the bin')\n  }\n}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: writes to a binned task are warned about and allowed.')
