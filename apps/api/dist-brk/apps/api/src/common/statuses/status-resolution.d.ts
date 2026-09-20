import type { Db } from '@rundesk/db';
export type StatusScope = 'list' | 'project' | 'space';
export type EffectiveStatus = {
    key: string;
    name: string;
    color: string;
    category: string;
    position: number;
};
export type ListStatusContext = {
    listId: string;
    projectId: string;
    spaceId: string;
    scope: StatusScope;
};
/**
 * Resolve which scope a list draws its statuses from, along with the owning
 * project + space ids. Returns null if the list does not exist.
 */
export declare function getListStatusContext(db: Db, listId: string): Promise<ListStatusContext | null>;
/**
 * Return the effective, ordered status set for a list — honouring its
 * `status_scope`. A list scoped to 'list' (the default) reads its own
 * `list_statuses`; 'project'/'space' read the shared template on the owning
 * project/space. Used by both the read endpoint and the task write path so
 * validation and display never diverge.
 */
export declare function resolveEffectiveStatuses(db: Db, listId: string, ctx?: ListStatusContext | null): Promise<EffectiveStatus[]>;
