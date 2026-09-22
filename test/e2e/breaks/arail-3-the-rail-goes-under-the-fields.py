# The rail stacks BELOW the fields instead of beside them.
#
# Which makes it the tab again, with extra scrolling — the suite's own words
# for the failure. The whole item is frame `01:20`: the feed to the RIGHT of
# the task while the field grid is still on screen, so "You estimated 12 hours"
# can be read next to the estimate it changed. Stacked, the two are as far
# apart as two tabs were, and one of them is now below a scroll.
#
# The class string that goes is `lg:flex-row lg:items-start`, which is the
# responsive half of a layout whose mobile half is `flex-col`. Deleting a
# breakpoint modifier is the most ordinary edit in a Tailwind codebase and
# nothing about it looks like a behaviour change: the rail is still rendered,
# still complete, still in the DOM in the right order.
#
# IT REDDENED ONE, NOT TWO, AND THAT FOUND THE LOAD-BEARING CHECK BEING WEAKER
# THAN ITS OWN COMMENT. "It sits BESIDE the panel rather than under it" failed
# on the boxes: panel at y=383 h=566, rail at y=965 h=258. "The field grid and
# the activity feed are on screen together" PASSED — it counted rendered field
# cells and matched text inside the rail, and both are true of a rail sitting
# 965px down a 1000px viewport with 35 pixels of itself visible.
#
# That check's comment says "readable in the same instant" and "every check
# above could pass on a build that simply renamed the Activity tab; this one
# cannot". It could: below the fold IS the tab again, with extra scrolling. It
# is renamed to what it measures — both rendered — and a new check asserts the
# geometry: a readable strip of the rail inside the viewport with the fields
# inside it too. This patch reddens that one as well.
#
# Reddens: activity-rail: "and it sits BESIDE the panel rather than under it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "            <div className={cn('pt-4', activityRail && 'flex flex-col gap-4 lg:flex-row lg:items-start')}>"
b = "            <div className={cn('pt-4', activityRail && 'flex flex-col gap-4')}>"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the activity rail stacks under the fields instead of beside them.')
