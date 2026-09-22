# Removing a person drops the FIRST entry rather than the one asked for.
#
# IT RAN GREEN, AND THIS HEADER HAD ALREADY SAID WHY: "looks correct whenever
# the first is the one being removed, which is what a check that only removed
# one person would have tested". The check removed Sara, the first person
# picked, so `slice(1)` gave the same answer and the sentence about leaving the
# others where they were passed. A header that predicts its own green is a
# finding about the CHECK, and it sat unread because this suite's set had never
# been run.
#
# `team-schedules` takes Omar out of the MIDDLE now: dropping the first leaves
# [Omar, Noor] where removing Omar leaves [Sara, Noor], and the two readings are
# told apart.
#
# PREDICTED ONE.
# Reddens: team-schedules: "removing one person takes their column away and leaves the others where they were"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '      ? teamUserIds.filter((id) => id !== userId)\n'
b = '      ? teamUserIds.slice(1)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: removing anybody now removes the first person.')
