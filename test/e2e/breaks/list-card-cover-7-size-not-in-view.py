# A DENSITY THAT RESETS ON RELOAD.
#
# Card size and Card cover drop out of `currentViewConfig`, so the panel still
# works for as long as the page is open and remembers nothing afterwards. The
# Save-view chip never lights, which is the visible half, and a saved view
# writes a config without them, which is the half that loses the setting.
#
# Reddens list-card-cover: "changing Card size marks the view unsaved" and
# "and saving the view writes cardSize with it".
#
# ANCHOR REWRITTEN 21 September. It used to end at `})`, because `cardCover,`
# was the last entry in that object. The Customize/filter work inserted the
# three board switches — stackFields, showEmptyFields, collapseEmptyColumns —
# immediately after it, so the old anchor matched nothing and `wt-break.sh`
# reported `PATCH FAILED` rather than counting it among the confirmed. That is
# the harness behaving correctly; this is the patch catching up. The anchor is
# now the two lines alone, at their own indent, which is unique in the file.
#
# Reddens: list-card-cover: "and saving the view writes cardSize with it"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """
    cardSize,
    cardCover,
"""
b = """
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: card size and cover no longer reach the view config.')
