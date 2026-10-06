/**
 * THE FIELDS A LIST'S TASKS HAVE: the project's, less those scoped to another
 * list of it. A field with no `listId` is the whole project's.
 *
 * The server's rule (`fieldIsOnList`, custom-fields.service.ts), which reads a
 * task only these fields and now refuses a value for any other
 * (`found-30-sep/field-route-takes-another-projects-field`). A project's field
 * list (`GET /projects/:id/custom-fields`) holds every field of the project the
 * reader may see, those scoped to its other lists among them, and
 * the list page drew a column for a field scoped to another list: its cells
 * took a value (200) that the row, read back through the task's own fields,
 * never showed. The AI page offered the same fields for the list it would make
 * its task in.
 */
export function fieldIsOnList(field: { listId?: string | null }, listId: string): boolean {
  return field.listId == null || field.listId === listId
}

/** `fields`, less those scoped to a list other than `listId`, in the order given. */
export function fieldsOfList<F extends { listId?: string | null }>(fields: readonly F[], listId: string): F[] {
  return fields.filter((f) => fieldIsOnList(f, listId))
}
