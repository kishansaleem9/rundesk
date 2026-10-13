# WRIKE’S API IS TAKEN ON WHATEVER HOST THE TOKEN NAMES.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "takes Wrike’s API only on a host of wrike.com"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/wrike.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (!/^[a-z0-9-]+(\\.[a-z0-9-]+)*\\.wrike\\.com$/.test(h)) throw new AppError(APP_REFUSALS.elsewhere('Wrike'))\n",
     "  if (!h) throw new AppError(APP_REFUSALS.elsewhere('Wrike'))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u1-any-wrike-host: WRIKE’S API IS TAKEN ON WHATEVER HOST THE TOKEN NAMES.')
