# THE PAGE NAMES A DOC'S EXPORT ITSELF (`found-30-sep/list-export-saved-as-list-csv`): a second copy of the
# server's rule, in ASCII — every run of anything but `[a-zA-Z0-9._-]` a hyphen — so "Plan — Überblick" is saved
# as "Plan-berblick.md", whatever the server named it.
# Reddens: file-exports: "Docs → Export as Markdown saves the doc under its whole title, as the server names it"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
a = "                  void downloadFile(`/docs/${activeDoc.id}/export`).catch((err) =>\n"
b = "                  void downloadFile(`/docs/${activeDoc.id}/export`, `${(activeDoc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'}.md`).catch((err) =>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-4-the-page-names-the-doc-itself: the page works the doc export name out again')
