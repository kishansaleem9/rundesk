# A LIST THAT FAILED TO LOAD SAYS "NO LINKED DOCS." AGAIN.
# Reddens: linked-docs-access: "a list that fails to load says so — and not that there are none"
import io
p = '/home/user/rundesk/apps/web/src/components/task-linked-docs.tsx'
a = '      ) : linkedQuery.isError ? (\n        <p className="text-sm text-muted-foreground" data-testid="task-linked-docs-failed">{t(\'taskLinkedDocs.loadFailed\')}</p>\n      ) : linked.length === 0 ? (\n'
b = '      ) : linked.length === 0 ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lda-4-a-failed-list-is-an-empty-one: applied")
