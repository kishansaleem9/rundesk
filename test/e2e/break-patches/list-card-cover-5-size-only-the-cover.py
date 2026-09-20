# A COVER SIZE WEARING THE WRONG LABEL.
#
# The partial fix that looks complete on a board where every card has a cover:
# the band resizes, the card's own padding and title do not. Switch the covers
# off, or look at a task that never had one, and the control does nothing.
#
# Reddens list-card-cover: "and so does a card with no cover".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """  small:  { pad: 'p-1.5', title: 'text-[12px]', cover: 'h-10', coverPx: 40, estimate: 60 },
  medium: { pad: 'p-2',   title: 'text-sm',     cover: 'h-16', coverPx: 64, estimate: 76 },
  large:  { pad: 'p-3',   title: 'text-[15px]', cover: 'h-28', coverPx: 112, estimate: 104 },"""
b = """  small:  { pad: 'p-2', title: 'text-sm', cover: 'h-10', coverPx: 40, estimate: 60 },
  medium: { pad: 'p-2', title: 'text-sm', cover: 'h-16', coverPx: 64, estimate: 76 },
  large:  { pad: 'p-2', title: 'text-sm', cover: 'h-28', coverPx: 112, estimate: 104 },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: Card size now resizes only the cover band; a card with no cover is the same at all three.')
