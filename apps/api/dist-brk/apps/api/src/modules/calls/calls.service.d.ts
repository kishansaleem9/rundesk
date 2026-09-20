import type { Db } from '@rundesk/db';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MeetingsService } from '../meetings/meetings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { R2Service } from '../../common/storage/r2.service';
/**
 * §2.8 SyncUp — the call itself.
 *
 * Media never touches the server: peers connect directly and the gateway only
 * relays the handshake. What lives here is the part that must be true for
 * everyone at once — who is in the call, whether it is being recorded, and
 * what record it leaves behind.
 */
export declare class CallsService {
    private db;
    private realtime;
    private meetings;
    private notifications;
    private ai;
    private r2;
    private flags;
    constructor(db: Db, realtime: RealtimeGateway, meetings: MeetingsService, notifications: NotificationsService, ai: AiService, r2: R2Service, flags: FeatureFlagsService);
    private assertMember;
    /**
     * A call in a channel is reachable by that channel's members, not by the
     * workspace at large — otherwise starting one in a private channel would
     * ring everybody.
     */
    private assertCanReach;
    /** The live call in a channel, if there is one. */
    liveInChannel(channelId: string, userId: string): Promise<{
        participants: {
            userId: string;
            joinedAt: Date;
            leftAt: Date | null;
            wasRecorded: boolean;
            name: string;
            email: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        channelId: string | null;
        startedById: string;
        title: string | null;
        startedAt: Date;
        endedAt: Date | null;
        recording: boolean;
        recordingStartedAt: Date | null;
        meetingId: string | null;
        recordingStorageKey: string | null;
        createdAt: Date;
    } | null>;
    participantsOf(callId: string): Promise<{
        userId: string;
        joinedAt: Date;
        leftAt: Date | null;
        wasRecorded: boolean;
        name: string;
        email: string;
        avatarUrl: string | null;
    }[]>;
    /**
     * Start a call, or join the one already running.
     *
     * Two people pressing the button at the same moment must land in the SAME
     * call — starting two and letting them wonder why they cannot see each other
     * is the obvious failure and the hardest one to report.
     */
    start(workspaceId: string, userId: string, input: {
        channelId?: string;
        title?: string;
    }): Promise<{
        participants: {
            userId: string;
            joinedAt: Date;
            leftAt: Date | null;
            wasRecorded: boolean;
            name: string;
            email: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        channelId: string | null;
        startedById: string;
        title: string | null;
        startedAt: Date;
        endedAt: Date | null;
        recording: boolean;
        recordingStartedAt: Date | null;
        meetingId: string | null;
        recordingStorageKey: string | null;
        createdAt: Date;
    }>;
    /**
     * §2.8 gap 9 — a call nobody is told about is a call nobody joins.
     *
     *   `[19:25]` "aap ko notification aa raha hoga ke CALL ka option aaya… aap
     *   chaho to wahan se direct call join ho jaoge"
     *
     * Two things, because they answer two different questions. The card in the
     * channel is for the person who scrolls back an hour later and wants to know
     * what happened; the notification is for the person who is not looking at
     * this channel at all, which is everybody, most of the time.
     */
    private announce;
    /**
     * Join, unless it ended in the moment since somebody read that it had not.
     *
     * Only for start(), which reads the live call and then joins it as two
     * separate statements. `null` means "there is nothing running here after
     * all" — go and start one — and every other failure is still the caller's
     * answer. join()'s one BadRequest is the ended call; not being able to reach
     * it at all comes back as NotFound or Forbidden and is not swallowed here.
     */
    private joinIfLive;
    join(callId: string, userId: string): Promise<{
        participants: {
            userId: string;
            joinedAt: Date;
            leftAt: Date | null;
            wasRecorded: boolean;
            name: string;
            email: string;
            avatarUrl: string | null;
        }[];
        id: string;
        workspaceId: string;
        channelId: string | null;
        startedById: string;
        title: string | null;
        startedAt: Date;
        endedAt: Date | null;
        recording: boolean;
        recordingStartedAt: Date | null;
        meetingId: string | null;
        recordingStorageKey: string | null;
        createdAt: Date;
    }>;
    leave(callId: string, userId: string): Promise<{
        ok: boolean;
        meetingId: string | null;
        pending: boolean;
    } | {
        ok: boolean;
        remaining: number;
    }>;
    /**
     * End the call and leave a meeting record behind.
     *
     * The record is what makes a call findable a week later, so it is written
     * here rather than left to the client: a browser that is closed as the call
     * ends must not take the record with it.
     */
    end(callId: string, userId: string): Promise<{
        ok: boolean;
        meetingId: string | null;
        pending: boolean;
    }>;
    /**
     * §2.8 gap 10 — turn recording on or off.
     *
     * Consent is enforced HERE, not in the UI. The flag flips and an event goes
     * to everyone in the call in the same breath, so there is no state in which
     * recording is on and somebody has not been told. Every person currently in
     * the call is marked as recorded at the moment it starts, so the question
     * "was I on that recording" has an answer that does not depend on reading
     * timestamps back.
     */
    setRecording(callId: string, userId: string, recording: boolean): Promise<{
        ok: boolean;
        recording: boolean;
    }>;
    /**
     * §2.8 gap 10 — one line of what somebody said.
     *
     * Each participant's own browser transcribes their own microphone, which is
     * why the speaker is known rather than guessed: a mixed audio track gives one
     * stream of words with nobody's name on it, and "somebody said they would
     * send the deck" is not a note worth having.
     *
     * Refused unless recording is ON. That is the whole consent story: the banner
     * everyone can see is what makes it lawful to keep any of this, so nothing is
     * kept while the banner is down. A client that keeps talking after recording
     * stops gets a quiet no, not a silent yes.
     */
    appendTranscript(callId: string, userId: string, text: string, replacesPrevious?: boolean): Promise<{
        ok: false;
        reason: "ended";
    } | {
        ok: false;
        reason: "not_recording";
    } | {
        ok: false;
        reason: "empty";
    } | {
        ok: true;
        reason?: undefined;
    }>;
    /**
     * The whole call, as words, attributed and in order.
     *
     * Names are resolved here rather than stored on each line: people rename
     * themselves, and a transcript that says who someone WAS in March is a
     * transcript nobody can search in June.
     */
    transcriptFor(callId: string): Promise<string>;
    /**
     * What the caller may read back while the call is still running.
     *
     * Being in the CHANNEL is not enough. The consent story is that everyone in
     * the call is told it is being recorded — and somebody sitting in the channel
     * who never joined was never told anything, yet could read verbatim what was
     * being said, live. That is eavesdropping with extra steps.
     *
     * Having LEFT is fine: they were there, they saw the banner, and the words
     * are as much theirs as anyone's.
     */
    liveTranscript(callId: string, userId: string): Promise<{
        transcript: string;
    }>;
    /**
     * Turn the transcript into notes.
     *
     * Returns null rather than throwing when no model is configured: a call that
     * ends must leave its record, its attendees and its recording behind whether
     * or not the AI half of this is available on the instance. A meeting with a
     * transcript and no notes is still a meeting; a call that refused to end
     * because a model was missing is a disaster.
     */
    private notesFrom;
    /**
     * §2.8 gap 10 — where to PUT the recording.
     *
     * The media never passes through the server during the call, and it does not
     * start to now: the browser uploads the file straight to storage with a
     * pre-signed URL, and only the key comes back here.
     */
    recordingUploadUrl(callId: string, userId: string, contentType: string): Promise<{
        uploadUrl: string;
        storageKey: string;
    }>;
    /**
     * The upload finished — remember where it landed.
     *
     * APPENDED, not overwritten. Recording is a toggle, so a call can be
     * recorded, stopped for a private aside, and recorded again; each stop
     * produces its own file. Writing a single key meant the second upload
     * replaced the first and that earlier audio stayed in storage with nothing
     * pointing at it and nobody aware it existed.
     */
    attachRecording(callId: string, userId: string, storageKey: string): Promise<{
        ok: boolean;
    }>;
}
