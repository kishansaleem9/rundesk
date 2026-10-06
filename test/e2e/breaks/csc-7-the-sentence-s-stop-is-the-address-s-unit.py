# A FULL STOP OR A BRACKET AFTER AN ADDRESS IS TAKEN INTO IT, asked of the splitter itself.
# Reddens: unit: link-addresses.test.ts "a full stop, comma or bracket after an address is the sentence’s, and a bracket it opened is its own"
import io
p = '/home/user/rundesk/apps/web/src/lib/link-addresses.ts'
a = '    const href = withoutTail(m[0])\n'
b = '    const href = m[0]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csc-7-the-sentence-s-stop-is-the-address-s-unit: link-addresses.ts: a full stop or bracket after an address is taken into it.')
