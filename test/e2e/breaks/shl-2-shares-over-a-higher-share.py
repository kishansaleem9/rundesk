# SHARING OVER SOMEBODY'S HIGHER SHARE REWRITES IT.
# Reddens: share-levels: "nor changes or removes a share above their own — by changing it, sharing over it, or removing it: the admin’s Full edit share for another member stays as it was"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = '        const [held] = await this.db.select({ level: objectShares.level }).from(objectShares).where(eq(objectShares.id, dupe.id)).limit(1)\n        this.assertWithinOwnLevel(loc.actorLevel, held.level as ShareLevel)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-2-shares-over-a-higher-share: applied')
