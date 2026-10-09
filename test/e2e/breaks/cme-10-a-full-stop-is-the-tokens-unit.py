# A SENTENCE'S FULL STOP AFTER A CLIP'S LINK IS READ AS PART OF ITS TOKEN, so the link names no clip.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: unit: clip-links.test.ts "a clip’s link on this site names its clip"
import io
p = '/home/user/rundesk/apps/web/src/lib/clip-links.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    url = new URL(href.replace(/[.,;:!?\'"\\]]+$/, \'\'), origin)\n',
     "    url = new URL(href, origin) // BROKEN: the sentence's full stop is the token's\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cme-10-a-full-stop-is-the-tokens-unit: A SENTENCE'S FULL STOP AFTER A CLIP'S LINK IS READ AS PART OF ITS TOKEN, so the link names no clip.")
