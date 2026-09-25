# A SHARE ABOVE THE SHARER'S OWN IS REMOVED BY THEM.
# Reddens: share-levels: "nor changes or removes a share above their own — by changing it, sharing over it, or removing it: the admin’s Full edit share for another member stays as it was"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if (!held) throw new NotFoundException('Share not found')\n    this.assertWithinOwnLevel(loc.actorLevel, held.level as ShareLevel)\n    const [row] = await this.db.delete(objectShares)"
b = "    if (!held) throw new NotFoundException('Share not found')\n    const [row] = await this.db.delete(objectShares)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-4-removes-above-own: applied')
