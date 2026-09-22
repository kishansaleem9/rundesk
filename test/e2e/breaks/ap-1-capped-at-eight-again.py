# The picker draws only the first eight matches again.
#
# `availableMembers.slice(0, 8)` is the defect §V2-S17 exists to remove, and the
# suite's header says what it cost: "in a workspace with seventy members,
# sixty-odd of them could not be assigned to a task at all. This is the sharpest
# kind of defect in this codebase: the control was not slow or awkward, it was
# INCAPABLE, and it photographed as finished."
#
# The cap is not the bug on its own — the current code caps at twenty and says
# how many are hidden, which is the comment's own distinction: "the difference
# between a long list and a short one that lies about its length." Lowering the
# number below the roster is what puts people out of reach, and 8 is where it
# was.
#
# ONE CHECK. Eleven people are assignable in this fixture, so three fall off the
# end. The search still narrows, the pick still assigns, the invitation still
# works — everything except the one check that counts the rows, which is why it
# counts them rather than asking whether a particular person appeared. The
# suite's own comment records that its first version asked the weaker question
# and passed against exactly this patch.
#
# Reddens: assignee-picker: "assignable members are listed, not a fixed eight"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const SHOWN = 20"
b = "  const SHOWN = 8"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the assignee picker draws only eight matches again.')
