export declare class LoginDto {
    email: string;
    password: string;
    /**
     * Time-based one-time password (or a backup code) for accounts that have
     * two-factor authentication enabled. Optional at the DTO level: the login
     * flow only requires it once the account is known to have a verified TOTP
     * secret, and answers with `{ error: 'totp_required' }` (HTTP 401) when it is
     * needed but absent.
     */
    totpCode?: string;
}
