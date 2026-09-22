# The strip renders a tab only for sources the workspace has connected.
#
# This is the wrong instinct the item exists to correct, and it is a tidy one:
# why offer a tab that cannot answer? Because the tab is how a person learns
# the source EXISTS and can be connected. Hiding it means Gmail search is not
# missing, not broken and not offered — it simply is not there, and nothing on
# screen suggests it could be.
#
# Frame `01:12` shows all six across the strip, connected or not, which is the
# whole reason the registry returns `connected` as a field rather than
# filtering the list before it leaves the server.
#
# REDDENS THREE IN A CHAIN, and the chain is the point: no tab means no click,
# no click means no notice, no notice means no connect link. The strip itself
# still renders with All and Rundesk, so the first of the four browser checks
# stays green and the failure reads "the tabs are gone" rather than "the
# palette is gone".
#
# Reddens: search-sources: "with a tab for each source"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = "          {(sourcesQuery.data ?? []).map((s) => ("
b = "          {(sourcesQuery.data ?? []).filter((s) => s.connected).map((s) => ("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: unconnected sources no longer get a tab in the strip.')
