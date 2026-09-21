# The plain sentence goes away and the tile is left with a badge. "Unavailable"
# over a greyed switch looks like a schedule; it is actually a statement about
# what this product does not have, and it does not make it.
# Reddens: app-catalogue: "an app Rundesk cannot connect says so in words, and
#          one it can does not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = """          {!supported && (
            <p
              className="text-[11px] text-muted-foreground mt-1 leading-relaxed"
              data-testid="integration-not-connectable"
              data-provider={integration.id}
            >
              {t('integrations.notConnectable')}
            </p>
          )}
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: an unconnectable tile explains nothing.')
