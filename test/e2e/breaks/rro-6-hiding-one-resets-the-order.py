# CLEARING ONE SECTION'S BOX PUTS THE OTHERS BACK IN THE FRAME'S ORDER: hiding throws away the order the person set.
# Re-aimed 9 October: the rail's sections include a person's own now, asked of `railSectionsShown` with them (`commit-log/log-716d25c-1`).
# Reddens: rail-reorder: "clearing Meet with’s box takes it off the rail, and the others keep their order"
#   or "and its row sinks under the shown ones, unticked and with no grip"
#   or "with Meet with hidden, Team schedules is still drawn, at the foot of the rail"
#   or "the server stores no name that is no section and no repeat — each is refused, saying which, and the stored order stays as it was"
#
# Re-aimed 9 October: the last 3 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                            onHide={ownId ? undefined : () => saveRail.mutate(railShown.filter((s) => s !== key))}\n',
     '                            onHide={ownId ? undefined : () => saveRail.mutate(RAIL_SECTIONS.filter((s) => s !== key && railShown.includes(s)))}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("rro-6-hiding-one-resets-the-order: hiding one section puts the others back in the frame's order")
