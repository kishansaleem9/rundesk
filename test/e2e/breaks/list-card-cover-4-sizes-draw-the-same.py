# THREE OPTIONS, ONE CARD.
#
# Card size keeps its picker, its tick, its readout and its place in the view
# config. All three values draw the Medium card. Every check about the control
# responding still passes; only measured geometry can tell.
#
# Reddens list-card-cover: "the covered card grows with the size" and "and so
# does a card with no cover".
#
# Reddens: list-card-cover: "three options drawing the same card is a picker that demos perfectly"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """  small:  { pad: 'p-1.5', title: 'text-[12px]', cover: 'h-10', coverPx: 40, estimate: 60 },
  medium: { pad: 'p-2',   title: 'text-sm',     cover: 'h-16', coverPx: 64, estimate: 76 },
  large:  { pad: 'p-3',   title: 'text-[15px]', cover: 'h-28', coverPx: 112, estimate: 104 },"""
b = """  small:  { pad: 'p-2', title: 'text-sm', cover: 'h-16', coverPx: 64, estimate: 76 },
  medium: { pad: 'p-2', title: 'text-sm', cover: 'h-16', coverPx: 64, estimate: 76 },
  large:  { pad: 'p-2', title: 'text-sm', cover: 'h-16', coverPx: 64, estimate: 76 },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('$listId.tsx: Small, Medium and Large now draw identical cards.')
