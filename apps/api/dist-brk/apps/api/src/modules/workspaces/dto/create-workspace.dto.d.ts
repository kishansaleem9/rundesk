export declare class CreateWorkspaceDto {
    name: string;
    slug?: string;
    logoUrl?: string;
    primaryColor?: string;
    /**
     * §7 — the answers the create flow collects.
     *
     * Declared here because they would otherwise never arrive: the global
     * ValidationPipe runs with whitelist: true, so a field absent from this class
     * is stripped in transit and the handler sees undefined. That is exactly how
     * §1.1's taskTypeId went missing — the client sent it, the server never saw
     * it, and nothing anywhere reported a problem.
     */
    purpose?: string;
    /** What they were using before. Null when they take the skip. */
    comingFrom?: string;
}
