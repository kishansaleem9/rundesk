# HIDDEN, NOT REMOVED.
#
# Card cover → None takes the band out of the DOM but leaves a spacer of the
# same height, so the card never gets shorter and a virtualised column keeps
# scrolling as though the covers were still there. The testid is gone, so
# every "the cover is not drawn" check passes.
#
# Reddens list-card-cover: "and the card collapses to the height of one with no
# cover".
#
# Reddens: list-card-cover: "and the card collapses to the height of one with no cover"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      <div className={cn(hasCover && dims.pad)}>\n"
b = "      {cover === 'off' && <div className={dims.cover} />}\n      <div className={cn(hasCover && dims.pad)}>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: switching the cover off leaves a band-sized gap, so the card keeps its height.')
