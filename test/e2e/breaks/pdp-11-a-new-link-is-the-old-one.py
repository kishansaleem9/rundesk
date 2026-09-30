# THE SLUG IS MADE FROM THE DOC'S ID, not at random. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# Sharing again hands out the link that was turned off, and it opens again.
#
# Reddens: public-doc-page: "sharing it again makes a new link, and the one turned off stays closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const slug = randomBytes(12).toString('base64url')\n"
b = "    const slug = Buffer.from(docId.replace(/-/g, ''), 'hex').subarray(0, 12).toString('base64url')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-11-a-new-link-is-the-old-one: a new link is the old one')
