# The "Your workspaces" link is removed from the no-workspace sidebar, leaving
# /app/profile and /app/help with no way out for a session whose auth store
# cannot supply one.
#
# `/app` is the one destination that is never stale: it reads the workspace list
# from the API rather than the auth store, and the state this suite exists to
# pin is exactly the one where that store is wrong — the sidebar header reading
# "Select workspace" while inside a named workspace, with the switcher unable
# to offer it.
#
# REWRITTEN AFTER RUNNING GREEN. The first version wrapped the link in
# `{backTo ? … : null}`, on the reasoning that a session with no last-visited
# workspace would then have no escape. The assertion is
# `escape.locator('a[href="/app"]').count() > 0` and it runs in the FIRST
# context, where `backTo` is set — so the link still rendered and the check
# passed correctly. I read the check that time and then reasoned about the
# session state instead of checking which context the assertion runs in.
#
# Fifth instance of the same rule. Removing the link outright reddens it
# whatever the session holds, and leaves the check above — "the profile page
# offers a way back in the sidebar" — passing, because the container and the
# back-link are untouched.
#
# Reddens: no-dead-ends: "and \"Your workspaces\" is always offered as a fallback"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """            <Link
              to="/app"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('nav.yourWorkspaces')}</span>
            </Link>
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the workspace-picker fallback is gone from the no-workspace sidebar.')
