"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRIVE_SEARCH_SCOPE = void 0;
exports.grantCoversWholeDrive = grantCoversWholeDrive;
/**
 * §G03 [04:04–04:32] — "GOOGLE DRIVE … hum is ko LINK kar sakte hain … agar hum
 * Google Drive se search karein" — **humari** Google Drive. She means the whole
 * of it, and searches it on camera.
 *
 * This constant exists so the scope the product ASKS for and the query it
 * ISSUES cannot drift apart. They had:
 *
 *   - the grant requested was `drive.file`, which returns only files this app
 *     itself created or the user explicitly picked in Google's file picker;
 *   - the query issued was account-wide — `name contains '…' and trashed=false`,
 *     with no owner or app-data restriction.
 *
 * So Drive search asked Google for everything and was allowed to see almost
 * nothing, and it failed the way this audit keeps finding: **silently**. No
 * error, no notice, just an empty section that reads as "you have no matching
 * files".
 *
 * `drive.readonly` is a broader consent than `drive.file` and users will see
 * that on the Google screen. That is the honest trade for a feature whose whole
 * premise is searching a Drive the app did not create.
 */
exports.DRIVE_SEARCH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
/**
 * Whether a stored connection's grant can actually answer an account-wide
 * query. A connection made before the scope changed still holds `drive.file`
 * and will keep returning nothing until it is reconnected — worth saying out
 * loud rather than shipping another silent empty list.
 */
function grantCoversWholeDrive(scopes) {
    return (scopes ?? []).includes(exports.DRIVE_SEARCH_SCOPE);
}
//# sourceMappingURL=drive-scope.js.map