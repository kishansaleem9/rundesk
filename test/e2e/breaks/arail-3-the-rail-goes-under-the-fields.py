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
# REDDENS TWO, AND THEY ARE THE TWO THAT MEASURE GEOMETRY: "it sits BESIDE the
# panel rather than under it", and "the field grid and the activity feed are on
# screen together" — which the suite calls the check that matters most, because
# "everything else here could pass on a build that just renamed the tab, and
# that check could not." The tab-strip check and the reload check stay green.
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
