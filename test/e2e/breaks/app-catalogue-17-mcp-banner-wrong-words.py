# The banner stops being the banner the frame draws. Same shape, different
# promise — which is how a screenshot-matching exercise passes while the control
# says something the video never asked for.
# Reddens: app-catalogue: "the banner carries the frame's own two lines"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'integrations.mcpSubtitle': 'Give AI access to any tool or data source.',\n"
b = "  'integrations.mcpSubtitle': 'Advanced settings for administrators.',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('catalogs.ts: the MCP banner no longer says what the frame says.')
