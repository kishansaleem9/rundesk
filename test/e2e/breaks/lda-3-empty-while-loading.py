# THE TAB SAYS "NO LINKED DOCS." WHILE ITS LIST IS STILL LOADING.
# Reddens: linked-docs-access: "while the list loads the tab does not say there are none — and then names the open doc"
import io
p = '/home/user/rundesk/apps/web/src/components/task-linked-docs.tsx'
a = '      {linkedQuery.isPending ? (\n        <p className="text-sm text-muted-foreground"><InlineSkeleton /></p>\n      ) : linkedQuery.isError ? (\n'
b = '      {linkedQuery.isError ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lda-3-empty-while-loading: applied")
