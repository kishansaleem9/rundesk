# TICKING A TO-DO ON HOME CLOSES NOTHING.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "a to-do added on Home is a task of her Personal List, and ticking it closes the task (read by SQL)"
#
# The tick asks the list’s open status either way, so the task stays open.
import io
p = '/home/user/rundesk/apps/api/src/modules/personal-tasks/personal-tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const pick = done\n      ? rows.find((r) => r.category === 'closed')\n",
     "    const pick = done && false // BROKEN: a tick closes nothing\n      ? rows.find((r) => r.category === 'closed')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-16-a-tick-closes-nothing: TICKING A TO-DO ON HOME CLOSES NOTHING.')
