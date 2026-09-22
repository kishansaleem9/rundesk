# A ROW THAT ALWAYS SAYS THE SAME THING.
#
# The frame's Customize rows are readouts as well as doors: `Card size Medium`,
# `Card cover Image`. Wired to a constant, the panel demos perfectly — the
# submenu opens, the tick moves, the board changes — and the row keeps
# reporting the value it shipped with.
#
# Reddens list-card-cover: "and Card cover reads \"Image\", as the frame shows",
# "choosing Large changes what the row says it is set to", "and the row says so".
#
# Reddens: list-card-cover: "choosing Large changes what the row says it is set to"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "          <span data-testid={`${testId}-value`}>{labelOf(value)}</span>"
b = "          <span data-testid={`${testId}-value`}>{labelOf(options[0])}</span>"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("$listId.tsx: every Customize choice row now reports its FIRST option, whatever it is set to.")
