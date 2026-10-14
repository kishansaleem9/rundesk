# THE APPS TAB'S CATALOGUE LISTS CLICKUP AS A SEVENTH TOOL.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "ClickUp is on its own tab: the Apps tab’s tools are still its six"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return APPS_TAB.map((d) => {\n',
     '    return Object.values(APPS).map((d) => {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-13-clickup-on-the-apps-tab: THE APPS TAB'S CATALOGUE LISTS CLICKUP AS A SEVENTH TOOL.")
