# The "Your workspaces" link is shown only when a last-visited workspace is
# known, so a session that has none gets no way out of /app/profile at all.
#
# `backTo` comes from the auth store, and the state this suite exists to pin is
# exactly the one where that store is stale or empty — the sidebar header read
# "Select workspace" while inside a named workspace, and the switcher could not
# offer it either. Under that session the picker link is the ONLY escape, which
# is why it is unconditional: /app reads the workspace list from the API rather
# than the store, so it is the one destination that is never stale.
#
# With this patch the page still renders, the sidebar still draws, and the only
# thing missing is the way back. A dead end looks exactly like a page.
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
b = """            {backTo ? (
              <Link
                to="/app"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              >
                <LayoutGrid className="h-4 w-4 shrink-0" />
                <span className="truncate">{t('nav.yourWorkspaces')}</span>
              </Link>
            ) : null}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the workspace-picker fallback is gone when no last workspace is known.')
