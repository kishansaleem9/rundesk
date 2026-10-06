# A ONE-LINE COMMENT LINKS NOTHING again: the plain path draws every run as text, an address too.
# Reddens: comment-slash-commands: "an address in a one-line comment is a link, as one in a comment holding a list is: each opens in a new tab, a full stop or a bracket after it is not part of it, a javascript: address is not linked, and the comment reads as written"
import io
p = '/home/user/rundesk/apps/web/src/components/mention-text.tsx'
a = '              {splitAddresses(seg.value).map((part, j) =>\n'
b = '              {[{ text: seg.value }].map((part: { text: string } | { href: string }, j) =>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csc-5-a-one-line-comment-links-nothing: mention-text.tsx: the plain path draws every run as text.')
