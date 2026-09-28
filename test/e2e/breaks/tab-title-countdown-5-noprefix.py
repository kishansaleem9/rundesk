# Check 3 — the tab names the task but not the block.
#
# Drop the "Work on" prefix. Frame `16:05` reads "Work on dbgdh 2h 55m left",
# not "dbgdh 2h 55m left": the prefix is the person's own setting and it is
# what tells you the line is about a plan rather than about the task. Losing it
# is a one-word regression that no screenshot comparison would catch.
#
# Reddens: tab-title-countdown: "the tab names the block: ${JSON.stringify(runningTitle)}"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
s = io.open(p, encoding='utf-8').read()
a = "  return block.taskId ? `${prefix} ${label}`.trim() : label\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "  return label // BROKEN: the block prefix is dropped\n")
)
print("BROKE check 3: the tab drops the 'Work on' prefix the block is titled with")
