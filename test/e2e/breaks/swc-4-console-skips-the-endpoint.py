# THE CONSOLE'S SIGN OUT AS IT WAS: the store cleared, the server never told — a cookie session lives on.
# Reddens: sw-api-cache: "the console’s Sign out ends the session — the cookies left behind refresh nothing — and deletes an API cache written after start-up"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.admin.tsx'
a = '    await signOut()\n'
b = '    useAuthStore.getState().clear()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-4-console-skips-the-endpoint: applied")
