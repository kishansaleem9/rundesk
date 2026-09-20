# Close the dialog whatever the server says, so a refusal has to be retyped
# your way back to. This is why the path does not reuse ContainerEditDialog.
# Reddens: folder-create: "and the dialog stays open with the rejected name still in the box"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })\n      setFolderDialog(null)\n    } catch (err) {"
b = "      await qc.invalidateQueries({ queryKey: ['space-tree', workspaceId] })\n    } catch (err) {\n      setFolderDialog(null)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the folder dialog now closes on a REFUSAL and stays open on success — the name has to be retyped.')
