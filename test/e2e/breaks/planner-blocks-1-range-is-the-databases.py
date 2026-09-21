# The service's "a block must end after it starts" removed from both the create
# and the update path, leaving migration 0137's
# CONSTRAINT task_time_blocks_ends_after_starts CHECK (ends_at > starts_at).
#
# THE BLOCK IS STILL REFUSED. AllExceptionsFilter maps the 23514 to a 400, so a
# status-only assertion sees nothing at all. What changes is that the person is
# told a database was unhappy instead of what they did.
#
# THIS SUITE ALREADY KNEW. Its own comment beside the check reads: "whether the
# person is told what they did or told that a database was unhappy. Asserting
# the sentence is what makes the service's check load-bearing rather than
# decorative." The insight was written here, and in `sidebar-reorder-9`, and in
# `lists.service.ts`'s comment about the 409 — three times, each applied only
# where it was written. `task-merge`, `list-name-taken`, `ai-value` and
# `view-visibility` each had the same hole open.
#
# Both call sites, because patching one leaves the check free to exercise the
# other and go green against a defect in the same file.
#
# Reddens: planner-blocks:
#   "a block cannot end before it starts, and is told so in words"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = "    if (endsAt <= startsAt) throw new BadRequestException('A block must end after it starts')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 2, f'anchor appears {s.count(a)} times in {p}, expected exactly 2'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('planner.service.ts: only the CHECK constraint rejects a backwards block now.')
