# THE PLANNER’S EMPTY CHOICE SAYS “THE FIRST LIST I CAN ADD TO”.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: planner-default-list: "and the picker it sends them to shows the deleted choice as a list in the trash, not “My Personal List” — which it shows in another workspace, where /task passes that list over — and choosing that saves it, so /task lands in the Personal List again"
#
# The choice that sends a task to the Personal List calls itself the first list one can add to, as it did.
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  \'plannerSettings.defaultListPersonal\': "My Personal List",',
     '  \'plannerSettings.defaultListPersonal\': "The first list I can add to",'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-w3-the-empty-choice-says-the-first-list: THE PLANNER’S EMPTY CHOICE SAYS “THE FIRST LIST I CAN ADD TO”.')
