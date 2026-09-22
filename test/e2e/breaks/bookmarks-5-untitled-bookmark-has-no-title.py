# A bookmark saved without a name gets an empty title instead of standing in
# its own URL.
#
# `|| url` is the whole of the fallback, and the comment above it is the whole
# of the argument: "Somebody pasting a link and pressing Add has said
# everything they meant to; demanding a name as well is a second step for no
# gain." Without it the row is stored, listed, and renders as an anchor with
# no text — a line you can click and cannot read, which is worse than the
# second step would have been.
#
# It is the likeliest thing to lose here, because `|| url` on the end of a
# trim-and-slice chain reads as a leftover. Nothing fails without it: the
# insert succeeds, the column is `not null` and an empty string satisfies that.
#
# ONE CHECK. The external bookmark carries an explicit title, so everything
# the card checks is about that one and stays green; only the in-app save, the
# single place in the suite that omits a name, reddens.
#
# Reddens: bookmarks: "and an in-app path, standing in its own URL when no name is given"
import io
p = '/home/user/rundesk/apps/api/src/modules/bookmarks/bookmarks.service.ts'
a = "    const title = (body?.title ?? '').trim().slice(0, 200) || url"
b = "    const title = (body?.title ?? '').trim().slice(0, 200)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bookmarks.service.ts: an untitled bookmark is stored with an empty title.')
