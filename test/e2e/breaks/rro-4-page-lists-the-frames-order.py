# THE SIDEBAR PAGE LISTS THE SHOWN SECTIONS IN THE FRAME'S ORDER, NOT THE RAIL'S: the page and the rail disagree after a reorder.
# Re-aimed 9 October: the rail's sections include a person's own now, asked of `railSectionsShown` with them (`commit-log/log-716d25c-1`).
# Reddens: rail-reorder: "and the Sidebar page lists its rows in that order"
#   or "pressing ↓ on Backlog’s grip moves it one place down, in the stored order and on the rail"
#   or "clearing Meet with’s box takes it off the rail, and the others keep their order"
#   or "and its row sinks under the shown ones, unticked and with no grip"
#   or "with Meet with hidden, Team schedules is still drawn, at the foot of the rail"
#   or "the server stores no name that is no section and no repeat — each is refused, saying which, and the stored order stays as it was"
#
# Re-aimed 9 October: the last 5 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const railShown = railSectionsShown(settings?.railSections, own)\n',
     '  const railShown = RAIL_SECTIONS.filter((key) => railSectionsShown(settings?.railSections, own).includes(key))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("rro-4-page-lists-the-frames-order: the Sidebar page lists the sections in the frame's order")
