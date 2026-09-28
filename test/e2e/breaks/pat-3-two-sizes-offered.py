# XL is dropped from the row. Frame `14:05` draws three previews, and a check
# that only asserted "a size picker exists" would pass on two.
# Reddens: planner-appearance-toggles: "it offers the frame's three sizes in the frame's order, with exactly one chosen"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = 'export const GRID_SIZE_PREVIEW_PX = (Object.keys(GRID_SIZES) as PlannerGridSize[]).map((key) => ({\n'
b = 'export const GRID_SIZE_PREVIEW_PX = (Object.keys(GRID_SIZES) as PlannerGridSize[]).slice(0, 2).map((key) => ({\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-settings-dialog.tsx: Grid size offers two options instead of three.')
