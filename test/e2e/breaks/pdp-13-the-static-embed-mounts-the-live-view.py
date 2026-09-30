# THE PUBLIC PAGE'S LIST EMBED MOUNTS THE SIGNED-IN VIEW AGAIN (`found-30-sep/public-doc-page-reads-the-envelope`).
#
# `addNodeView: undefined` is read by Tiptap as "ask the parent", so the static
# embed draws ListEmbed's own view: it asks the API for the list as nobody,
# is refused, and tells the visitor the list has no tasks.
#
# Reddens: public-doc-page: "opening the link asks the API for nothing it refuses a visitor"
import io
p = '/home/user/rundesk/apps/web/src/lib/tiptap-doc-blocks.tsx'
a = "export const ListEmbedStatic = ListEmbed.extend({\n  addNodeView: null,\n"
b = "export const ListEmbedStatic = ListEmbed.extend({\n  addNodeView: undefined,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pdp-13-the-static-embed-mounts-the-live-view: the public embed asks the API as nobody')
