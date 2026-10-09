# A PHOTO'S CREDIT LINKS CARRY NO REFERRAL.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "“mountain” draws the library’s first page of mountain photos — twenty-four, each picture loaded — each crediting its photographer and Unsplash, with links that carry the referral"
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
print('cph-7-the-credit-carries-no-referral: the credit carries no referral')
