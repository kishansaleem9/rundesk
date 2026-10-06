# A TIMELINE DRAG THE SERVER REFUSES SAYS NOTHING (`found-30-sep/timeline-drags-refused-silently`): the bar goes
# back, or away, and the server's sentence is shown to nobody, as the timeline's `persistDates` had no `onError`.
# Reddens: timeline-dates: "a timeline drag the server refuses is said in its words: a task put in the bin after the page loaded is refused (409), the toast carries the server’s sentence, and the task keeps its dates (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
a = "      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))\n"
b = '      void err\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('timeline-dates-10-a-refusal-says-nothing: a refused drag is said to nobody')
