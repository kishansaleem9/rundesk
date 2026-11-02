# SETTINGS › GENERAL'S NAME BOX SAYS NOTHING IS WRONG, and offers Save for a blank name.
# Reddens: workspace-ownership: "Settings › General opens on the workspace’s avatar and name, says a blank name and one past 60 characters are wrong with Save off, counts a good one, and saves it trimmed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '  const nameProblem = workspaceNameProblem(name)\n  const nameDirty'
b = '  const nameProblem = workspaceNameProblem(name) && null\n  const nameDirty'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-3-the-name-box-says-nothing: applied")
