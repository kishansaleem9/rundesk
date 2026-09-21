# Check 1 — Delete is drawn directly UNDER Archive. Swap the two rows so the
# measured gap goes sharply negative.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
archive = """                      <DropdownMenuItem
                        data-testid="task-menu-archive"
                        onSelect={confirmArchive}
                      >
                        <ArchiveIcon className="mr-2 h-4 w-4" />
                        {t('taskDetail.archiveTask')}
                      </DropdownMenuItem>
"""
delete = """                      <DropdownMenuItem
                        data-testid="task-menu-delete"
                        onSelect={confirmDelete}
                        disabled={deleteTask.isPending}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('taskDetail.deleteTask')}
                      </DropdownMenuItem>
"""
assert s.count(archive) == 1, s.count(archive)
assert s.count(delete) == 1, s.count(delete)
assert s.index(archive) < s.index(delete)
s = s.replace(archive, '@@ARCHIVE@@').replace(delete, archive).replace('@@ARCHIVE@@', delete)
io.open(p, 'w', encoding='utf-8').write(s)
print('BROKE check 1: Delete now renders ABOVE Archive in the task menu')
