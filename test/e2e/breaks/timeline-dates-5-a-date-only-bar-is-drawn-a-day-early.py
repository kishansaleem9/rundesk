# A DATE-ONLY TIMELINE BAR IS DRAWN ON THE LOCAL DAY OF ITS UTC MIDNIGHT (`found-5-oct/timeline-press-moves-dates`):
# `startOfDay` of each instant, as the timeline drew it, so west of UTC a task of the 12th starts on the 11th.
# Reddens: timeline-dates: "a date-only bar is drawn on its own day in every zone: a task of 12 to 14 October starts on the 12th in Los Angeles and Karachi as in UTC, and one starting 7 October 09:00 on the 7th"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
a = '  const from = shownDay(task.startDate) ?? shownDay(task.dueDate)!\n  const to = shownDay(task.dueDate) ?? shownDay(task.startDate)!\n'
b = '  const from = new Date(startOfDay(new Date(task.startDate ?? task.dueDate!).getTime()))\n  const to = new Date(startOfDay(new Date(task.dueDate ?? task.startDate!).getTime()))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-5-a-date-only-bar-is-drawn-a-day-early: a date-only bar is drawn on the local day of its instant')
