/**
 * The secret box lives beside the schema (`@rundesk/db`), whose sealed columns
 * use it (`found-13-oct/provider-grants-kept-in-the-clear`); the API reads it here.
 */
export { isSealed, open, seal, secretBoxKey, secretBoxReadiness, SecretBoxRefused, SecretBoxUnavailable } from '@rundesk/db'
