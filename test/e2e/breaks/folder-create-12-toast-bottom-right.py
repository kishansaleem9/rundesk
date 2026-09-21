# Put the toaster back to bottom-RIGHT, where the privacy banner sits and has
# already swallowed clicks in three suites. Both frames draw bottom-LEFT.
# Reddens: folder-create: "and it sits bottom-left, where frame `08:55` stacks them"
import io, re
p = '/home/user/rundesk/packages/ui/src/components/toaster.tsx'
s = io.open(p, encoding='utf-8').read()
a = "bottom-left"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "bottom-right"))
print('toaster.tsx: toasts are bottom-right again — the corner the privacy banner lives in.')
