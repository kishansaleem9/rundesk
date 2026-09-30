# THE LIBRARY CALLS A CLIP BY ITS STORAGE FILE NAME (`found-30-sep/store-stub-drops-object-metadata`).
#
# The title a clip was recorded with travels as its object's metadata; a
# library that stops reading it names every clip by its key. That is what
# every lane showed while the store stub kept no metadata, so the check could
# not tell a product regression from the stub until the stub kept it.
#
# Reddens: clip-links: "and the library calls the clip by the title it was recorded with — the store keeps a clip’s metadata, as S3 does"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "      const title = head.Metadata?.title ?? fileName\n"
b = "      const title = fileName\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-26-the-library-calls-a-clip-by-its-file: the library ignores the recorded title')
