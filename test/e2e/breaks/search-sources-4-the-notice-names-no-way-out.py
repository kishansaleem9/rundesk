# The "not connected" notice keeps its sentence and loses its connect link.
#
# Half the item, removed. The person now learns that Gmail cannot answer and is
# told nothing about what to do next — and the place to do it is a settings
# page they have no reason to associate with a search box. A notice that names
# no way out is a dead end wearing an explanation.
#
# It is the likeliest half to be lost, because it is the half that does
# something: the span is text and the button carries a navigation with a
# non-null assertion on `workspaceId` in it, which is exactly the shape that
# gets pulled out during a cleanup and not put back.
#
# EXACTLY ONE CHECK. The notice still renders, so "choosing an unconnected one
# says so" stays green — which is what separates this patch from the one that
# removes the notice entirely, and what makes the two checks two checks.
#
# Reddens: search-sources: "and offers the way to connect it"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = """          <button
            type="button"
            data-testid="palette-source-connect"
            className="text-accent underline underline-offset-2"
            onClick={() => {
              setOpen(false)
              navigate({ to: '/app/$workspaceId/settings', params: { workspaceId: workspaceId! } })
            }}
          >
            {t('palette.sourceConnect')}
          </button>
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: the not-connected notice no longer offers a way to connect.')
