# CLEARING ONE SECTION'S BOX PUTS THE OTHERS BACK IN THE FRAME'S ORDER: hiding throws away the order the person set.
# Reddens: rail-reorder: "clearing Meet with’s box takes it off the rail, and the others keep their order"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '                          onHide={() => saveRail.mutate(railShown.filter((s) => s !== key))}\n'
b = '                          onHide={() => saveRail.mutate(RAIL_SECTIONS.filter((s) => s !== key && railShown.includes(s)))}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-6-hiding-one-resets-the-order: a hide saves the rest in the frame order')
