/**
 * §15 — every field here is decorated on purpose.
 *
 * The global ValidationPipe runs with `whitelist: true`, so a property that is
 * declared but not decorated is stripped in transit and the handler sees
 * undefined — no error, no log, nothing to notice. That is exactly how §1.1's
 * `taskTypeId` went missing for a week: the client sent it, the server never
 * saw it, and every test passed.
 */
export declare class CreateSkillDto {
    name: string;
    description?: string;
    instructions?: string;
    archetype?: string;
    visibility?: 'private' | 'workspace';
    enabled?: boolean;
}
export declare class UpdateSkillDto {
    name?: string;
    description?: string;
    instructions?: string;
    visibility?: 'private' | 'workspace';
    enabled?: boolean;
}
/**
 * §15 — what a person approved, coming back from the client.
 *
 * The proposal round-trips through the browser, so it is untrusted input like
 * any other body: bounded here, and then put through the same create path as a
 * hand-typed skill. `memories` is validated per element — an @IsArray alone
 * would let anything through inside it.
 */
export declare class ApproveSkillProposalDto {
    name: string;
    description?: string;
    instructions: string;
    memories?: string[];
}
export declare class AddSkillMemoryDto {
    content: string;
    source?: 'chat' | 'manual';
}
export declare class AddSkillConnectionDto {
    provider: string;
    /** Omitted when the workspace has not connected that provider yet. */
    connectionId?: string;
    config?: Record<string, unknown>;
}
