# The Link tab draws no address box — the state frame `03:15` rules out, where
# the tab exists and the thing it is named after does not.
#
# CASCADES, AND SAYS SO: with no box there is nothing to type into, so the
# refusal never appears and nothing is ever committed. Four checks go, and all
# four are true of a tab with no input. The run stays its full length because
# every read and fill in that section is bounded.
#
# Reddens: task-cover: "the Link tab carries an address box" (and the three under it)
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = '                  data-testid="cover-link-input"\n'
b = '                  data-testid="cover-link-input-removed"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: the Link tab has no address box.')
