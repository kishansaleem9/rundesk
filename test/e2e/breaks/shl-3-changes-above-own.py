# A SHARE'S LEVEL IS CHANGED TO ANY LEVEL, BY ANYBODY WHO MAY SHARE — their own, and one above them.
# Reddens: share-levels: "nor changes or removes a share above their own — by changing it, sharing over it, or removing it: the admin’s Full edit share for another member stays as it was"
#   or "a member shared a list at Edit may not raise themselves — sharing it with themselves at Full edit and changing their own share are refused, the share stays Edit, and adding a task is still refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = '    this.assertWithinOwnLevel(loc.actorLevel, lvl, held.level as ShareLevel)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-3-changes-above-own: applied')
