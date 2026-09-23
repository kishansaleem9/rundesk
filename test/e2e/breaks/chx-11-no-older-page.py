# THE NEWEST PAGE IS ALL THERE IS: nothing ever asks for the one before it.
# Reddens: chat-history: "and the last scroll reaches m001, after which there is nothing older to offer"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = '    getNextPageParam: (last) => (last.hasOlder ? last.items[0]?.id : undefined),\n'
b = '    getNextPageParam: () => undefined,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-11-no-older-page: applied")
