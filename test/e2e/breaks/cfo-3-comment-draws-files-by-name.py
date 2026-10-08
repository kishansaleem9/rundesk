# THE COMMENT SORTS ITS FILES BY NAME (`found-30-sep/comment-files-unordered`): the list hands
# them back in the order they were attached, and the comment draws them in another. Only the
# panel's check can see it; the list's is about what the API answers.
# Re-aimed 8 October (batch 19): a comment's files are drawn after the clip link's note (`comment-clips-have-no-copy-link`)
# Reddens: task-attachments: "and the comment draws them in that order"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = ("    <div className=\"mt-2 flex flex-wrap gap-2\">\n"
     "      {files.map((f) => {\n")
b = ("    <div className=\"mt-2 flex flex-wrap gap-2\">\n"
     "      {[...files].sort((x, y) => x.fileName.localeCompare(y.fileName)).map((f) => { // BROKEN: by name\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cfo-3-comment-draws-files-by-name: a comment draws its files sorted by name')
