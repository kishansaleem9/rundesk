# A TEMPLATE'S CARD DRAWS NONE OF ITS TAGS (`ledger-rows/row-1874`).
#
# The tags are stored, counted and filtered on, and the card says nothing: a
# person looking at a template cannot see what it is tagged with.
#
# Reddens: template-center: "and every card left shows its Q3 tag"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "        {tags.length > 0 && (\n"
b = "        {/* BROKEN: no tags on the card */ false && tags.length > 0 && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-20-cards-show-no-tags: cards draw no tag chips')
