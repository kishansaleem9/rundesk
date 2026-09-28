# A PAPERCLIP POINTING NOWHERE. Download becomes href=# exact defect the comment clip player shipped: a link that looks right,
# clicks, and does nothing at all.
# Reddens: task-attachments: "Download is a real anchor with a `download` attribute, pointing at THIS attachment's url"
#   or "all 6 links on the cards point somewhere — none is a paperclip over \"#\""
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    href={a.url}
                    download={a.fileName}"""
b = """                    href="#"
                    download={a.fileName}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the attachment download link now points at '#'.")
