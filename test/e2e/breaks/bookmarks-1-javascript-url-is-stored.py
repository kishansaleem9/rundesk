# `normalizeUrl` stops refusing the schemes it does not recognise and stores
# whatever it was given.
#
# A bookmark is rendered as an anchor on this origin, so `javascript:alert(1)`
# is script that runs the moment somebody clicks their own saved item — and
# `data:` and `blob:` are the same thing wearing different words. The method's
# comment says the check is on the way IN "so a row that exists is a row that
# is safe to render, rather than leaving every future read path to remember";
# this patch is that responsibility moving back to every read path, which
# means nowhere.
#
# The empty-url refusal above it is untouched, so the method still validates
# SOMETHING — which is the shape that makes this survive review. It is not "the
# validation was deleted"; it is "the allow-list became a deny-list of one".
#
# REDDENS ONE CHECK. The two saves above it still work, the ownership check is
# unrelated, and the card is untouched. A patch that also broke the http(s)
# path would prove the method runs, not that it refuses.
#
# Reddens: bookmarks: "a javascript: url is refused, not stored"
import io
p = '/home/user/rundesk/apps/api/src/modules/bookmarks/bookmarks.service.ts'
a = """    if (/^https?:\\/\\//i.test(url)) return url.slice(0, 2000)
    throw new BadRequestException('a bookmark must be an in-app path or an http(s) url')
"""
b = """    return url.slice(0, 2000)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bookmarks.service.ts: any scheme is now stored, javascript: included.')
