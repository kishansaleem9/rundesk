# THE COVER PICKER HAS NO SEARCH TAB.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "the cover picker has a Search tab, which asks what to search Unsplash’s library of free photos for"
#   or "“mountain” draws the library’s first page of mountain photos — twenty-four, each picture loaded — each crediting its photographer and Unsplash, with links that carry the referral"
#   or "“More photos” adds the second page — thirty in all, none twice — and is gone once the library has no more"
#   or "choosing one makes it the task’s cover — the photo’s own address, as the server holds it, drawn on the sheet, in place of the colour — and the library is told it was used, as Unsplash asks"
#   or "words no photo holds say there are no photos for them, and draw none"
#   or "a library that fails is said to have not answered, and its rate limit as too many searches — never an empty grid"
#   or "and the next search, the library answering again, draws its photos"
#
# Everything after the tab fails with it: each check searches from it.
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              <TabsTrigger value="search" data-testid="cover-tab-search">{t(\'coverImage.tab.search\')}</TabsTrigger>\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-w1-no-search-tab: no search tab')
