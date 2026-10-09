# `cph-7`'s edit, claimed by the unit test: a photo's credit links carry no referral.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: unit: cover-photos.controller.test.ts "a photo is credited to its photographer and Unsplash with the referral, and one with nothing to draw is no result"
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/photo-library.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("const withReferral = (href: string) => `${href}${href.includes('?') ? '&' : '?'}${REFERRAL}`\n",
     'const withReferral = (href: string) => (REFERRAL ? href : href) // BROKEN: no referral\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cph-10-the-photographer-goes-unreferred-unit: `cph-7`'s edit, claimed by the unit test: a photo's credit links carry no referral.")
