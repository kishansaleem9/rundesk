# The Upload tab draws its prompt and no input — a tab named after an action
# that cannot start. Frame `03:05` lists Upload as one of six.
#
# The hidden `<input type="file">` is what the button reaches for, so removing
# its testid is the state where the tab looks complete and nothing can be
# chosen.
#
# CASCADES, AND SAYS SO: with no input there is nothing to choose, so no upload
# is attempted, nothing is reported and the cover is untouched — which the two
# checks below then say about a tab that cannot start. Three checks, all true of
# it. The run stays its full length because every read and fill in that section
# is bounded.
#
# Reddens: task-cover: "the Upload tab offers a way to choose a file" (and the two under it)
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = '                data-testid="cover-upload-input"\n'
b = '                data-testid="cover-upload-input-removed"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: the Upload tab has no file input.')
