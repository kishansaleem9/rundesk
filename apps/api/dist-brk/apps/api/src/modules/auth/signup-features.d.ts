/**
 * G08-4 [08:43], [09:02] — the rows the feature picker turns into.
 *
 * A pure function, and separate from `signUp` on purpose. Testing this inside
 * the signup transaction would mean mocking eight inserts to assert one of
 * them; here the thing that can actually be wrong — which flags end up on and
 * which off — is checkable directly, and the transaction only has to be
 * trusted to write what it is handed.
 */
export declare function signupFeatureRows(picked: string[] | undefined, workspace: {
    id: string;
}, actorId: string): {
    flagKey: import("@rundesk/feature-flags").FlagKey;
    scope: "workspace";
    scopeId: string;
    workspaceId: string;
    enabled: boolean;
    updatedBy: string;
}[];
