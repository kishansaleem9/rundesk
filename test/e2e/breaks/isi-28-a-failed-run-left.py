# A RUN THAT FAILS LEAVES WHAT IT MADE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: importers-by-sign-in: "a run Asana stops answering half-way fails in Asana’s words — sign in again — and takes away what it had made: the Space, the Folder and the tasks of the project it had read"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (this.madeSpaces.length) await this.db.delete(spaces).where(inArray(spaces.id, this.madeSpaces))\n',
     ''),
    ('      if (this.madeProjects.length) await this.db.delete(projects).where(inArray(projects.id, this.madeProjects))\n',
     ''),
    ('      if (this.madeLists.length) await this.db.delete(lists).where(inArray(lists.id, this.madeLists))\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-28-a-failed-run-left: A RUN THAT FAILS LEAVES WHAT IT MADE.')
