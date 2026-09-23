# THE OVERCORRECTION: every attachment committed as a link, so an uploaded image
# becomes a cover pointing at a signed URL that expires, instead of the stored
# key that is re-signed on every read.
# Reddens: task-cover: "and an uploaded image chosen the same way becomes the stored cover, served signed, with its own bytes"
import io
p = "/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx"
a = "                          a.kind === 'link'"
b = "                          true"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-cover-16-picker-files-as-links: applied")
