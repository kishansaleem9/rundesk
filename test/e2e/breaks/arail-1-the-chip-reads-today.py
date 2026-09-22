# The created-date chip renders TODAY instead of the task's creation date.
#
# The suite's header names this patch: "AND THE ONE THAT PROTECTS THE CHIP. A
# chip reading 'Created <today>' passes any presence check while being wrong for
# every task older than this morning."
#
# So the chip is there, in the right place, in the reader's own date format,
# with a full timestamp in its `title` — and it says the wrong thing about every
# task but the ones made in the last few hours. The header's whole job here is
# to tell you how old a task is without opening the feed and scrolling to the
# end of it, and this is that job done backwards.
#
# `new Date()` where `detailQuery.data.createdAt` was is the shape a
# copy-and-paste from any other date chip leaves behind, and nothing downstream
# can tell: `formatDate` takes a date and formats it.
#
# ONE CHECK, AND IT IS THE ONE THAT READS THE VALUE. "no created-date chip"
# passes, because the chip renders; only the check that compares what it says
# against the task's real `createdAt` fails. Everything about the rail is
# untouched.
#
# Reddens: activity-rail: "and it shows when the task was really created, not today"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                      {t('taskDetail.createdOn', { date: formatDate(detailQuery.data.createdAt) })}"
b = "                      {t('taskDetail.createdOn', { date: formatDate(new Date().toISOString()) })}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the created chip now reads today\'s date for every task.')
