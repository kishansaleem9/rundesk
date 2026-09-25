# A SHARE IS GIVEN AT ANY LEVEL, as it was: to themselves at Full edit, and to anybody.
# Reddens: share-levels: "nor gives more than they hold: Full edit for another member is refused and nothing is shared, Edit is given"
#   or "a member shared a list at Edit may not raise themselves — sharing it with themselves at Full edit and changing their own share are refused, the share stays Edit, and adding a task is still refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    const level = this.assertLevel(input.level ?? 'view')\n    this.assertWithinOwnLevel(loc.actorLevel, level)\n"
b = "    const level = this.assertLevel(input.level ?? 'view')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-1-gives-above-own: applied')
