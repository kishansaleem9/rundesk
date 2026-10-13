# An "image" is sent as one whatever its bytes are.
# Reddens: brain-comments-and-decks: "an \"image\" that is not one is refused, not passed on as noise"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/composer-files.ts'
# Re-aimed 13 October: taking the check out left `mediaType` possibly null, which did not build.
a = '    const mediaType = imageType(bytes)\n    if (!mediaType) throw refuse(`“${name}” is not an image`)\n'
b = "    const mediaType = imageType(bytes) ?? 'image/png'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-13-images-unchecked: An "image" is sent as one whatever its bytes are.')
