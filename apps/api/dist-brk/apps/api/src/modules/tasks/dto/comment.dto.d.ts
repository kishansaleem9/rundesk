export declare class CreateCommentDto {
    /**
     * §V2-05 — NOT `@IsNotEmpty()`, and that is the point.
     *
     * Frame `04:45` posts a voice note with no words beside it, and `05:35` a
     * recorded clip the same way. `@IsNotEmpty()` here rejected those before the
     * service was ever called, so the service's own "words or a file" rule ran
     * for nothing and the composer's mic could record something it could never
     * post.
     *
     * The emptiness rule still exists — it just lives where the attachments can
     * be resolved. `TasksService.createComment` refuses a body-less comment
     * unless at least one of the given `attachmentIds` is a real row on this
     * task, which is a check a DTO cannot make.
     */
    body: string;
    parentCommentId?: string;
    mentions?: Array<{
        userId: string;
        offset: number;
        length: number;
    }>;
    attachmentIds?: string[];
}
