# THE RAIL IS DRAWN IN THE FRAME'S ORDER AGAIN, WHATEVER IS STORED: the shown set is honoured and its order is not.
# Re-aimed 9 October: the rail's sections include a person's own now, asked of `railSectionsShown` with them (`commit-log/log-716d25c-1`).
# Reddens: rail-reorder: "after a reload the rail is drawn in the stored order, Backlog first"
#   or "and the rail behind the dialog is redrawn in it without a reload"
#   or "pressing ↓ on Backlog’s grip moves it one place down, in the stored order and on the rail"
#   or "clearing Meet with’s box takes it off the rail, and the others keep their order"
#   or "with Meet with hidden, Team schedules is still drawn, at the foot of the rail"
#   or "a stored name that is no section, and a repeat, are passed over: the rail draws Today & overdue, then Priorities, once each"
#
# Re-aimed 9 October: the last 5 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const railShown = railSectionsShown(settings?.railSections, ownSections.data ?? [])\n',
     "  const railShown = railSectionsShown(settings?.railSections, ownSections.data ?? []).sort((x, y) =>\n    ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog'].indexOf(x) -\n    ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog'].indexOf(y))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("rro-1-rail-drawn-in-the-frames-order: the rail is drawn in the frame's order, whatever is stored")
