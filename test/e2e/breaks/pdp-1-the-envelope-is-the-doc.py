# THE PAGE TAKES THE API'S ENVELOPE FOR THE DOC, as it did before. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# `{ data, meta, error }` has no title, no date and no content: the page draws
# an empty heading, "Invalid Date" and an empty editor.
#
# Reddens: public-doc-page: "anybody holding the link reads the doc’s title, signed in nowhere, at /d/<slug>"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      const body = (await res.json().catch(() => null)) as { data?: PublicDoc | null } | null\n      if (!body?.data) throw new PublicDocError(res.status)\n      return body.data\n'
b = '      return (await res.json()) as PublicDoc\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-1-the-envelope-is-the-doc: the page reads the envelope as the doc')
