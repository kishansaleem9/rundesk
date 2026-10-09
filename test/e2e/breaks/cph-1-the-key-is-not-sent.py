# THE LIBRARY IS ASKED WITHOUT THE SERVER'S KEY.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "“mountain” draws the library’s first page of mountain photos — twenty-four, each picture loaded — each crediting its photographer and Unsplash, with links that carry the referral"
#   or "“More photos” adds the second page — thirty in all, none twice — and is gone once the library has no more"
#   or "choosing one makes it the task’s cover — the photo’s own address, as the server holds it, drawn on the sheet, in place of the colour — and the library is told it was used, as Unsplash asks"
#   or "and the next search, the library answering again, draws its photos"
#   or "words no photo holds say there are no photos for them, and draw none"
#   or "a library that fails is said to have not answered, and its rate limit as too many searches — never an empty grid"
#   or "the library is searched for the workspace’s own members; a blank search, a page past fifty, and a photo the library does not hold are refused"
#
# Re-aimed 8 October: the last 3 of these are knock-ons of the same edit, measured on lane 8 — checks that stand on what the first ones lost.
# Every search is refused, so every check that draws a photo fails with it.
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/photo-library.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      headers: { authorization: `Client-ID ${cfg.key}`, 'accept-version': 'v1' },\n",
     "      headers: { authorization: `Client-ID ${cfg.key.length < 0 ? cfg.key : 'none'}`, 'accept-version': 'v1' }, // BROKEN: no key\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-1-the-key-is-not-sent: the key is not sent')
