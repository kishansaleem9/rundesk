# The Team schedules card leaves the carousel. The panel still pages and still
# reads correctly — it simply stops naming the feature §V2-15b builds.
# Reddens: planner-onboarding: "and the card frame `12:48` ends on is Team schedules, which §V2-15b builds"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "  const CARDS = ['joinMeeting', 'meetingNotes', 'blockTime', 'teamSchedules'] as const\n"
b = "  const CARDS = ['joinMeeting', 'meetingNotes', 'blockTime'] as const\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the Team schedules card is gone from the carousel.')
