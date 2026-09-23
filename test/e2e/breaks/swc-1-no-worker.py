# NO SERVICE WORKER AT ALL: nothing is cached, so "no API answer is cached" would pass for the wrong reason.
# Reddens: sw-api-cache: "the service worker controls the page and keeps the app’s own files"
import io
p = '/home/user/rundesk/apps/web/vite.config.ts'
a = "    VitePWA({\n      registerType: 'autoUpdate',\n"
b = "    VitePWA({\n      disable: true,\n      registerType: 'autoUpdate',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-1-no-worker: applied")
