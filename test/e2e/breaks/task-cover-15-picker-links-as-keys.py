# THE PICKER AS IT WAS: every attachment committed as a stored key, so a linked
# image's URL went into coverStorageKey. The server now refuses that (a stored
# cover must be one of the task's own objects), and before it did, the cover
# was signed as `${CDN}/https://…` and never drew.
# Reddens: task-cover: "and choosing it makes that image the cover — served as it was linked, not signed as a key"
import io
p = "/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx"
a = "                          a.kind === 'link'"
b = "                          false"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-cover-15-picker-links-as-keys: applied")
