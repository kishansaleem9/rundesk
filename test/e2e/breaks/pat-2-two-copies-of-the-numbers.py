# The swatch row keeps its own copy of the sizes and they drift, so the swatch
# advertises 72px while the grid draws 64. The duplicated-list defect with
# integers instead of strings, and the picker goes on looking right.
#
# IT RAN GREEN, AND THE REASON IS THAT THE FIRST VERSION WROTE DEAD CODE. It
# changed `GRID_SIZES.large` from 72 to 64 and added a second constant beside
# it — `_SWATCH_SIZES` — that nothing read. The check compares the number the
# swatch ADVERTISES against the number the grid DRAWS, and both come from
# `GRID_SIZES`, so moving that one declaration moves both together and they go
# on agreeing. The check was right to stay green: the two still matched.
#
# A patch for a duplicated list has to make something READ the second copy, or
# it is not a duplicated list at all. So this points `GRID_SIZE_PREVIEW_PX` —
# the swatch row — at its own numbers, and drifts `GRID_SIZES` by one entry. The
# swatch then says 72 where the grid draws 64, which is exactly the failure the
# check's comment describes and the only way to produce it.
#
# PREDICTED ONE. The check above it — "Large really is a bigger row than
# Default" — still passes, because 64 is still bigger than 48. That is the point
# of having both: a size that changed is not a size that lies about itself.
#
# Reddens: planner-appearance-toggles: "and it is the size the swatch advertises"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = """export const GRID_SIZES = { default: 48, large: 72, xl: 96 } as const
export type PlannerGridSize = keyof typeof GRID_SIZES
/** The swatch row, in the frame's own order. */
export const GRID_SIZE_PREVIEW_PX = (Object.keys(GRID_SIZES) as PlannerGridSize[]).map((key) => ({
  key,
  px: GRID_SIZES[key],
}))
"""
b = """export const GRID_SIZES = { default: 48, large: 64, xl: 96 } as const
export type PlannerGridSize = keyof typeof GRID_SIZES
const SWATCH_SIZES = { default: 48, large: 72, xl: 96 } as const
/** The swatch row, in the frame's own order. */
export const GRID_SIZE_PREVIEW_PX = (Object.keys(GRID_SIZES) as PlannerGridSize[]).map((key) => ({
  key,
  px: SWATCH_SIZES[key],
}))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-settings-dialog.tsx: the swatch and the grid disagree about "Large".')
