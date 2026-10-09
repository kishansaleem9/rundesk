# A PICTURE'S NAME KEEPS ITS DESCRIPTION'S CAPITALS.
# (`ledger-rows/row-870`)
# Reddens: unit: image-generation.test.ts "a picture is named after its description and its place: lower case, words joined by hyphens, forty characters at most, and “image” when no word is left"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/image-generation.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const words = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-')",
     "  const words = prompt.replace(/[^a-zA-Z0-9]+/g, '-')"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("aig-10-names-keep-their-case-unit: A PICTURE'S NAME KEEPS ITS DESCRIPTION'S CAPITALS.")
