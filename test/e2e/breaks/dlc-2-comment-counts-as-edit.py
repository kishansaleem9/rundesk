# THE DOC'S CAPABILITIES ASK COMMENT FOR EDITING: a Comment share is offered the editor.
# Reddens: doc-level-controls: "a member with a Comment share is shown the doc read only — the editor takes no typing, and no Save, formatting, Archive or Delete is offered"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowedBy(this.assertDocLevel(docId, userId, 'edit')),\n"
b = "      allowedBy(this.assertDocLevel(docId, userId, 'comment')),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-2-comment-counts-as-edit: capabilities give Comment editing')
