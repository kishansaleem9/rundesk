# The card stops depending on there being anything wrong: every connection is
# handed a message, so an error card outlives the error it reports and sends
# people to fix a problem that is already fixed.
# Reddens: "and the card is gone from the page",
#          "clearing the last one leaves the page with no error cards at all".
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "        lastError: row.lastError ?? null,"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
b = "        lastError: row.lastError ?? 'Something went wrong.',"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('[break 3] gave every connection a fallback error in workspace-integrations-page.tsx —')
print('          clearing last_error no longer takes the card away.')
