# The map drawn with no tiles asked of the tile server.
#
# Reddens: list-views: "the Map tab draws the marker and asks the tile server for the tiles around it"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/map-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    if (!data?.tiles) return []\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    if (data?.tiles || !data?.tiles) return []\n"))
