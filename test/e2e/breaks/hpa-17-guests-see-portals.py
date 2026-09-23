# A GUEST SEES THE PORTAL SECTION — and "No portal yet", which is not what the server holds.
# Reddens: hook-portal-access: "on the project page, blocked sharing disables making a portal and says why — and a guest has no portal section"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = '  if (isGuest) return null\n\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-17-guests-see-portals: applied")
