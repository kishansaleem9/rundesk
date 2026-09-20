/**
 * §2.8 SyncUp — calls inside the app, `[19:16–21:15]`.
 *
 * A call is a live thing; a meeting is the record it leaves behind. They are
 * separate rows on purpose: `meetings` already exists and already carries
 * notes, attendees, action items and a recording URL, so a call that ends
 * should FILL one rather than inventing a parallel history nobody can search.
 *
 * Signalling is peer-to-peer over the Socket.io gateway Rundesk already runs.
 * No media passes through the server, which is why this needs no SFU and no
 * third-party service — and also why it is honest about its limits: beyond a
 * handful of people, or on a network that needs TURN, it will say so rather
 * than half-work.
 */
export declare const calls: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "calls";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "calls";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        workspaceId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "workspace_id";
            tableName: "calls";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        channelId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "channel_id";
            tableName: "calls";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        startedById: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "started_by_id";
            tableName: "calls";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        title: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "calls";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        startedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "started_at";
            tableName: "calls";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        endedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "ended_at";
            tableName: "calls";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        recording: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "recording";
            tableName: "calls";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        recordingStartedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "recording_started_at";
            tableName: "calls";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        meetingId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "meeting_id";
            tableName: "calls";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        recordingStorageKey: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "recording_storage_key";
            tableName: "calls";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "calls";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const callParticipants: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "call_participants";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "call_participants";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        callId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "call_id";
            tableName: "call_participants";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "call_participants";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        joinedAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "joined_at";
            tableName: "call_participants";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        leftAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "left_at";
            tableName: "call_participants";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        wasRecorded: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "was_recorded";
            tableName: "call_participants";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const callsRelations: import("node_modules/drizzle-orm").Relations<"calls", {
    workspace: import("node_modules/drizzle-orm").One<"workspaces", true>;
    channel: import("node_modules/drizzle-orm").One<"chat_channels", false>;
    startedBy: import("node_modules/drizzle-orm").One<"users", true>;
    meeting: import("node_modules/drizzle-orm").One<"meetings", false>;
    participants: import("node_modules/drizzle-orm").Many<"call_participants">;
}>;
export declare const callParticipantsRelations: import("node_modules/drizzle-orm").Relations<"call_participants", {
    call: import("node_modules/drizzle-orm").One<"calls", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
/**
 * §2.8 gap 10 — the call's transcript, one utterance at a time.
 *
 *   "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega"
 *   `[20:42]`
 *
 * A line per utterance, attributed to whoever said it. Attribution is the whole
 * reason this is a table rather than a text column on the call: "Hamda said
 * she would send the deck" is a useful note and "somebody said they would send
 * the deck" is not.
 *
 * Written live, so a call that crashes halfway still leaves the half it heard —
 * and so the notes at the end are written from something real rather than from
 * a recording nobody has transcribed yet.
 */
export declare const callTranscriptLines: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "call_transcript_lines";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "call_transcript_lines";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        callId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "call_id";
            tableName: "call_transcript_lines";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        userId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "call_transcript_lines";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        text: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "text";
            tableName: "call_transcript_lines";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        saidAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "said_at";
            tableName: "call_transcript_lines";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * §2.8 — one piece of a call's recording.
 *
 * Recording is a toggle, so a call can be recorded, stopped for a private
 * aside, and recorded again. Each stop produces its own file. A single key on
 * the call meant the second upload overwrote the first and the earlier audio
 * stayed in storage with nothing pointing at it.
 *
 * Append-only. `position` orders them for playback and is not assumed
 * contiguous: a failed upload leaves a gap, and inventing one would
 * misrepresent what was actually captured.
 */
export declare const callRecordings: import("node_modules/drizzle-orm/pg-core").PgTableWithColumns<{
    name: "call_recordings";
    schema: undefined;
    columns: {
        id: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "call_recordings";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        callId: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "call_id";
            tableName: "call_recordings";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        storageKey: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "storage_key";
            tableName: "call_recordings";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        position: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "position";
            tableName: "call_recordings";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        createdAt: import("node_modules/drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "call_recordings";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const callRecordingsRelations: import("node_modules/drizzle-orm").Relations<"call_recordings", {
    call: import("node_modules/drizzle-orm").One<"calls", true>;
}>;
export declare const callTranscriptLinesRelations: import("node_modules/drizzle-orm").Relations<"call_transcript_lines", {
    call: import("node_modules/drizzle-orm").One<"calls", true>;
    user: import("node_modules/drizzle-orm").One<"users", true>;
}>;
