# A RESULT DRAWS NO CREDIT FOR ITS PHOTOGRAPHER.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "“mountain” draws the library’s first page of mountain photos — twenty-four, each picture loaded — each crediting its photographer and Unsplash, with links that carry the referral"
#
# `Credit` stays declared, and unused, as the compile allows.
import io
p = '/home/user/rundesk/apps/web/src/components/cover-photo-search.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("                <Credit template={t('coverImage.photoCredit')} author={photo.author} />\n",
     '                {null /* BROKEN: no credit */}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-w2-the-credit-is-not-drawn: the credit is not drawn')
