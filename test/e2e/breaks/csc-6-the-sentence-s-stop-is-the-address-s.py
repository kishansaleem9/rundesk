# A FULL STOP OR A BRACKET AFTER AN ADDRESS IS TAKEN INTO IT: the link points at another address.
# Reddens: comment-slash-commands: "an address in a one-line comment is a link, as one in a comment holding a list is: each opens in a new tab, a full stop or a bracket after it is not part of it, a javascript: address is not linked, and the comment reads as written"
import io
p = '/home/user/rundesk/apps/web/src/lib/link-addresses.ts'
a = '    const href = withoutTail(m[0])\n'
b = '    const href = m[0]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csc-6-the-sentence-s-stop-is-the-address-s: link-addresses.ts: a full stop or bracket after an address is taken into it.')
