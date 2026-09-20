import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;
export declare function getDb(connectionString?: string): Db;
