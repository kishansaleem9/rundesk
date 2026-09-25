# THE APP CENTER IGNORES THE APP IT WAS OPENED AT: all its tiles, searched for nothing.
# Reddens: search-sources: "and that way is the App Center, at the source’s own app"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const [query, setQuery] = useState(() => INTEGRATIONS.find((i) => i.id === openedAt)?.name ?? '')\n"
b = "  const [query, setQuery] = useState(() => INTEGRATIONS.find((i) => i.id === openedAt && openedAt === '')?.name ?? '')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('search-sources-9-catalogue-opens-at-nothing: the catalogue opens at nothing')
