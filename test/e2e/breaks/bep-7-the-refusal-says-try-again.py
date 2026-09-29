# A TURN THE SERVER REFUSED IS ANSWERED "SORRY, I ENCOUNTERED AN ERROR. PLEASE TRY AGAIN."
#
# What the dock did until the reason reached the message: `sendMessage` read
# the server's sentence out of the refusal and the catch replaced it with the
# house line. On a lane with no model the header says "Not configured" and the
# answer under it tells you to try again — which will fail the same way, for a
# reason the person was never shown.
#
# Reddens: brain-entry-points: "and the dock answers that turn as /ai/status says it will — with no model, in the server’s own words: “AI features are not configured”"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """
            content: err?.refused && err.message ? String(err.message) : t('aiPanel.errorMessage'),
"""
b = """
            content: t('aiPanel.errorMessage'),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: a refused turn is answered with the house "try again" line.')
