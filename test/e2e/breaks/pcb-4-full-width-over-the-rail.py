# The bar is made to float over the WHOLE APP — `fixed` instead of `absolute`,
# and no width cap — so it spans the viewport and swallows clicks over the rail,
# where "+ Add priority" and the backlog rows sit at the same height.
#
# IT RAN GREEN TWICE, AND THE THIRD TIME EXPLAINED BOTH.
#
# First: the check read the rail's `.x` under the name `railRight` — the rail's
# LEFT edge — so a bar overlapping the rail's right half compared as clear of
# it, and `?? 0` turned a rail that was not on screen into a rail at x=0, after
# which `barBox.x > 0` is true of every bar that exists. That was a real check
# defect and it is fixed: the rail's box must exist and the comparison is
# against its RIGHT edge.
#
# Then it ran green AGAIN, and the numbers say why. This patch used to remove
# `max-w-xl` and nothing else, on the reasoning that the container is
# `absolute inset-x-0 … px-4` so the bar would start at 16px. IT DOES NOT.
# `absolute` resolves against the nearest positioned ancestor, which is the
# CALENDAR region — to the right of the rail — so the measured run came back
# "left edge (560px) is clear of the rail, which ends at 531px". The premise was
# read off class names instead of measured, by me, in the header of a patch
# whose whole job is to be measured.
#
# `fixed` is what makes `inset-x-0` mean the viewport. With the cap gone too the
# bar spans 16px to the right edge and really is over the rail.
#
# PREDICTED ONE. The centring check survives: a viewport-wide bar has its middle
# at ~960px against a grid middle of ~1000px, inside that check's 50px
# tolerance, which is the tolerance being a tolerance rather than a hole.
#
# Reddens: planner-command-bar: "is clear of the rail, which ends at"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">'
b = '        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">'
c = '            className="pointer-events-auto flex w-full max-w-xl items-center gap-2'
d = '            className="pointer-events-auto flex w-full items-center gap-2'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'container anchor appears {s.count(a)} times, expected exactly 1'
assert s.count(c) == 1, f'bar anchor appears {s.count(c)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))
print('workspace-planner-page.tsx: the command bar floats over the whole app, rail included.')
