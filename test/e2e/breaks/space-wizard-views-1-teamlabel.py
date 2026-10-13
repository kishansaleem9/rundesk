# The `team` entry gone from the label map again — the defect, exactly.
# vite does not typecheck, so this builds; the row renders its raw key.
#
# IT NAMED THE ROW-ORDER CHECK, WHICH PASSES. The panel still draws six rows in
# the server's order; what falls is the label on ONE of them, which is the
# defect — `VIEW_LABEL` had no `team` entry, so the row fell through to a
# sibling's string and read "team" where the frame says "Team". A labelled row
# with the WRONG label passes any presence check, which is why there is one
# check per row naming the word.
#
# AND THE CHECK COULD NOT BE QUOTED. Its sentence was
# `the ${view} row reads "${EXPECTED_LABEL[view]}"`, whose only literal fragment
# is ` row reads "` — twelve characters and two words. `space-wizard-views` says
# `is labelled with the frame's own word` now, so the iteration this patch
# reddens can be named.
#
# PREDICTED ONE, the `team` iteration of eleven.
#
# Reddens: space-wizard-views, the `team` iteration of
#   "row is labelled with the frame's own word"
import io
p='/home/user/rundesk/apps/web/src/lib/space-views.ts'
s=io.open(p,encoding='utf-8').read()
a="  gantt: 'list.viewGantt',\n  team: 'list.viewTeam',\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  gantt: 'list.viewGantt',\n"))
