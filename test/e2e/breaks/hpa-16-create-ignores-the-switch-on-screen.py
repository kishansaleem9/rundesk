# THE PORTAL FORM OFFERS "CREATE" UNDER THE SWITCH — and says nothing until the server refuses.
# Reddens: hook-portal-access: "on the project page, blocked sharing disables making a portal and says why — and a guest has no portal section"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
a = '          <Button type="submit" size="sm" data-testid="client-portal-create" disabled={createPortal.isPending || sharingBlocked}>\n'
b = '          <Button type="submit" size="sm" data-testid="client-portal-create" disabled={createPortal.isPending}>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-16-create-ignores-the-switch-on-screen: applied")
