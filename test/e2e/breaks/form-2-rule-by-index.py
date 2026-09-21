# Put the group rule back on a literal index. Every item is still present, in
# order, with the right label — and the rule now separates Dashboard from Form
# instead of Form from List. This is the regression that shipped unnoticed.
# Reddens: space-create-menu: "the rule falls where the containers begin"
import io
p = "/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx"
a = "                          {i > 0 && type.isContainer && !SPACE_CREATE_TYPES[i - 1].isContainer && (\n                            <DropdownMenuSeparator data-testid=\"create-menu-container-rule\" />\n                          )}"
b = "                          {i === 5 && <DropdownMenuSeparator data-testid=\"create-menu-container-rule\" />}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the rule is back on a hardcoded index, one item too high.')
