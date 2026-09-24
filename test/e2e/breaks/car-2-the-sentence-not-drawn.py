# THE MENU PRINTS THE CODE IN BRACKETS, the sentence it was given unread.
# Reddens: create-ai-results: "a refused step says why, in the sentence the server gives — not its code"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '                {r.message ? (\n'
b = '                {!r.reason && r.message ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("car-2-the-sentence-not-drawn: applied")
