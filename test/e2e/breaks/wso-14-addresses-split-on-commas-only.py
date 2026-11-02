# PASTED ADDRESSES ARE SPLIT ON COMMAS ONLY: a space or a line between two makes them one.
# Reddens: workspace-ownership: "pasted at once, separated by commas, spaces and lines, the two good addresses are invited, and a word, an address with no dot and somebody already in it are each flagged on their own and left in the box — and the API refuses the word and the member itself"
import io
p = '/home/user/rundesk/apps/web/src/lib/email-list.ts'
a = '  for (const raw of flattened.split(/[\\s,;]+/)) {\n'
b = '  for (const raw of flattened.split(/,/)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-14-addresses-split-on-commas-only: applied")
