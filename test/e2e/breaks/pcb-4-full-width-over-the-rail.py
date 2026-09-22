# The bar spans the whole surface and swallows clicks over the rail, where
# "+ Add priority" and the backlog rows sit at the same height.
#
# IT RAN GREEN ON TWO SEPARATE FAULTS IN ONE CHECK. The check read the rail's
# `.x` under the name `railRight` — the rail's LEFT edge — so a bar overlapping
# the rail's right half compared as clear of it. And `?? 0` turned a rail that
# was not on screen into a rail at x=0, after which `barBox.x > 0` is true of
# every bar that exists.
#
# The patch is right about the layout: the container is
# `absolute inset-x-0 … px-4`, so removing `max-w-xl` really does start the bar
# at 16px, over the rail. `planner-command-bar` requires the rail's box to exist
# and compares against its RIGHT edge now, which is what the paragraph above
# that check had always said it did.
#
# PREDICTED ONE.
# Reddens: planner-command-bar: "its left edge is clear of the rail"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '            className="pointer-events-auto flex w-full max-w-xl items-center gap-2'
b = '            className="pointer-events-auto flex w-full items-center gap-2'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the command bar now spans the full width.')
