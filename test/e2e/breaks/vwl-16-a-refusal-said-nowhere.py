# A REFUSED VIEW WRITE SAYS NOTHING: the page reads the strip again and is silent.
# Reddens: view-writes-by-level: "a rename the page still offered and the server refuses says why, in the server’s words, and saves nothing"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "      toast.error(refusalMessage(err, t('list.view.changeFailed')))\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vwl-16-a-refusal-said-nowhere: a refused view write says nothing: the page reads the strip again and is silent')
