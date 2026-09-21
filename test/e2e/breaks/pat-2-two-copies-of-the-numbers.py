# The dialog keeps its own copy of the sizes and they drift, so the swatch
# advertises 72px while the grid draws 64. The duplicated-list defect with
# integers instead of strings, and the picker goes on looking right.
# Reddens: planner-appearance-toggles: "it is the size the swatch advertises"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = 'export const GRID_SIZES = { default: 48, large: 72, xl: 96 } as const\n'
b = 'export const GRID_SIZES = { default: 48, large: 64, xl: 96 } as const\nconst _SWATCH_SIZES = { default: 48, large: 72, xl: 96 } as const\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-settings-dialog.tsx: the swatch and the grid disagree about "Large".')
