import io, sys
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
s = io.open(p, encoding='utf-8').read()
a = """    const { settings, isWorkspaceAdmin } = await this.securitySettings.getEffectiveForUser(user.id)
    const primaryWorkspaceId = settings.workspaceId"""
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
s = s.replace(a, """    const primaryWorkspaceId = memberships[memberships.length - 1]?.workspace.id ?? null
    const settings = await this.securitySettings.get(primaryWorkspaceId)
    const isWorkspaceAdmin = memberships[memberships.length - 1]?.role === 'workspace_admin'""")
io.open(p, 'w', encoding='utf-8').write(s)
print('login now binds to an arbitrary membership again (the last one)')
