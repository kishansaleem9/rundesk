# A RENAME IS STORED AS IT ARRIVES: blank, spaces, a hundred characters.
# Reddens: workspace-ownership: "a workspace is refused a blank name and one past 60 characters, made with 60 emoji, and a rename keeps its rule — trimmed, its inner whitespace folded, the old name kept when refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '      const named = cleanWorkspaceName(patch.name)\n      if (!named.ok) throw new BadRequestException(named.reason)\n      set.name = named.name\n'
b = '      set.name = patch.name\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-2-rename-unchecked: applied")
