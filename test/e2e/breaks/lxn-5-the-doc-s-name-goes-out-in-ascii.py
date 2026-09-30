# A DOC'S EXPORT IS NAMED IN ASCII ALONE (`found-30-sep/list-export-saved-as-list-csv`): the server keeps
# `[a-zA-Z0-9._-]` and makes a hyphen of the rest, as it did, with no `filename*`, so "Plan — Überblick" is sent,
# and saved, as "Plan-berblick.md".
# Reddens: file-exports: "Docs → Export as Markdown saves the doc under its whole title, as the server names it"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = "    const { fileName, disposition } = downloadName(doc.title, '.md', 'document')\n"
b = (
    "    const fileName = `${(doc.title || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document'}.md`\n"
    "    const disposition = `attachment; filename=\"${fileName}\"`\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-5-the-doc-s-name-goes-out-in-ascii: the Markdown export is named in ASCII alone')
