# THE WAY BACK FROM ONE TOOL TAKES A STATE SIGNED FOR ANOTHER.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a way back carrying a state signed for another tool, or not by this server, is refused and keeps nothing; and a grant is its importer’s own — another admin here reads nothing through it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!state.ws || !state.user || state.app !== app || Date.now() - Number(state.ts) > 10 * 60 * 1000) return null\n',
     '      if (!state.ws || !state.user || Date.now() - Number(state.ts) > 10 * 60 * 1000) return null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-1-a-state-for-any-tool: THE WAY BACK FROM ONE TOOL TAKES A STATE SIGNED FOR ANOTHER.')
