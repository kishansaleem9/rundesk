

import {
  ChevronDown,
  LoaderCircle,
  Mic,
  Send,
  Square,
  X,
} from "lucide-react";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ComposerPopup,
  MessageAttachment,
  Task,
  User,
} from "@/lib/rundesk/types";

import AiMenu from "./AiMenu";
import CommandPicker from "./CommandPicker";
import AttachmentMenu from "./AttachmentMenu";
import ClipRecorderMenu from "./ClipRecorderMenu";
import ComposerToolbar from "./ComposerToolbar";
import ComposerPlusMenu from "./ComposerPlusMenu";
import EmojiPicker from "./EmojiPicker";
import MentionPicker from "./MentionPicker";
import TaskPicker from "./TaskPicker";

interface TaskDraft {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string;
  assigneeIds: string[];
  sourceMessageId?: string;
}

interface Props {
  channelName: string;
  users: User[];
  currentUser: User;
  tasks: Task[];
  taskDraft: {
    sourceMessageId: string;
    content: string;
  } | null;
  initialValue: string;
  onDraftChange: (value: string) => void;
  onSend: (
    content: string,
    attachments: MessageAttachment[],
  ) => Promise<boolean>;
  onCreateTask: (
    task: TaskDraft,
  ) => Promise<boolean>;
}

export default function Composer({
  channelName,
  users,
  currentUser,
  tasks,
  taskDraft,
  initialValue,
  onDraftChange,
  onSend,
  onCreateTask,
}: Props) {
  const [value, setValue] =
    useState(initialValue);

  const [open, setOpen] =
    useState<ComposerPopup>(null);

  const [notice, setNotice] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [attachments, setAttachments] =
    useState<MessageAttachment[]>([]);

  const [formatting, setFormatting] =
    useState(false);

  const [recording, setRecording] =
    useState(false);

  const [
    recordingSeconds,
    setRecordingSeconds,
  ] = useState(0);

  const [task, setTask] =
    useState<TaskDraft>({
      title:
        taskDraft?.content.slice(
          0,
          200,
        ) ?? "",

      description:
        taskDraft?.content ?? "",

      status: "TODO",
      priority: "NORMAL",
      dueDate: "",

      assigneeIds: [
        currentUser.id,
      ],

      sourceMessageId:
        taskDraft?.sourceMessageId,
    });

  const rootRef =
    useRef<HTMLDivElement>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  const recorderRef =
    useRef<MediaRecorder | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(
      null,
    );

  const voiceChunksRef =
    useRef<Blob[]>([]);

  const discardVoiceRef =
    useRef(false);

  useEffect(() => {
    if (taskDraft) {
      queueMicrotask(() =>
        setOpen("create-task"),
      );
    }
  }, [taskDraft]);

  useEffect(() => {
    if (!recording) return;

    const timer =
      window.setInterval(() => {
        setRecordingSeconds(
          (value) => value + 1,
        );
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      streamRef.current
        ?.getTracks()
        .forEach((track) =>
          track.stop(),
        );
    },
    [],
  );

  useEffect(() => {
    const outside = (
      event: MouseEvent,
    ) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(
          event.target as Node,
        )
      ) {
        setOpen(null);
      }
    };

    const escape = (
      event: globalThis.KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setOpen(null);
      }
    };

    document.addEventListener(
      "mousedown",
      outside,
    );

    document.addEventListener(
      "keydown",
      escape,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        outside,
      );

      document.removeEventListener(
        "keydown",
        escape,
      );
    };
  }, []);

  const update = (next: string) => {
    setValue(next);
    onDraftChange(next);
  };

  const toggle = (
    popup: Exclude<
      ComposerPopup,
      null
    >,
  ) => {
    setOpen((current) =>
      current === popup
        ? null
        : popup,
    );
  };

  const insert = (text: string) => {
    update(
      `${value}${
        value &&
        !value.endsWith(" ")
          ? " "
          : ""
      }${text} `,
    );

    setOpen(null);
  };

  const flash = (
    message: string,
  ) => {
    setNotice(message);
    setOpen(null);

    window.setTimeout(
      () => setNotice(""),
      3000,
    );
  };

  const wrap = (
    before: string,
    after = before,
  ) => {
    const area =
      textareaRef.current;

    if (!area) return;

    const start =
      area.selectionStart;

    const end =
      area.selectionEnd;

    const selected =
      value.slice(start, end) ||
      "text";

    update(
      `${value.slice(
        0,
        start,
      )}${before}${selected}${after}${value.slice(
        end,
      )}`,
    );

    queueMicrotask(() => {
      area.focus();

      area.setSelectionRange(
        start + before.length,
        start +
          before.length +
          selected.length,
      );
    });
  };

  async function submit() {
    if (
      (!value.trim() &&
        attachments.length ===
          0) ||
      sending
    ) {
      return;
    }

    setSending(true);

    if (
      await onSend(
        value.trim(),
        attachments,
      )
    ) {
      update("");
      setAttachments([]);
      setOpen(null);
    }

    setSending(false);
  }

  async function createTask(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (
      await onCreateTask(task)
    ) {
      setTask({
        title: "",
        description: "",
        status: "TODO",
        priority: "NORMAL",
        dueDate: "",

        assigneeIds: [
          currentUser.id,
        ],
      });

      flash("Task created");
    }
  }

  async function upload(
    file: File,
  ) {
    const form = new FormData();

    form.append("file", file);

    try {
      const response = await fetch(
        "/api/upload",
        {
          method: "POST",
          body: form,
        },
      );

      const item =
        (await response.json()) as MessageAttachment & {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          item.error ??
            "Upload failed",
        );
      }

      setAttachments(
        (current) => [
          ...current,
          item,
        ],
      );

      flash(
        `${file.name} ready to send`,
      );
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : "Upload failed",
      );
    }
  }

  async function toggleVoice() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    if (
      !navigator.mediaDevices
        ?.getUserMedia ||
      typeof MediaRecorder ===
        "undefined"
    ) {
      flash(
        "Voice recording is not supported in this browser",
      );

      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
          },
        );

      streamRef.current =
        stream;

      voiceChunksRef.current =
        [];

      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) =>
        MediaRecorder.isTypeSupported(
          type,
        ),
      );

      const recorder =
        new MediaRecorder(
          stream,
          preferred
            ? {
                mimeType:
                  preferred,
              }
            : undefined,
        );

      recorderRef.current =
        recorder;

      recorder.ondataavailable =
        (event) => {
          if (event.data.size) {
            voiceChunksRef.current.push(
              event.data,
            );
          }
        };

      recorder.onstop =
        async () => {
          const type =
            recorder.mimeType ||
            "audio/webm";

          const blob =
            new Blob(
              voiceChunksRef.current,
              {
                type,
              },
            );

          stream
            .getTracks()
            .forEach((track) =>
              track.stop(),
            );

          streamRef.current =
            null;

          recorderRef.current =
            null;

          setRecording(false);
          setRecordingSeconds(0);

          if (
            discardVoiceRef.current
          ) {
            discardVoiceRef.current =
              false;

            voiceChunksRef.current =
              [];

            flash(
              "Voice recording discarded",
            );

            return;
          }

          if (!blob.size) {
            return;
          }

          const extension =
            type.includes("ogg")
              ? "ogg"
              : "webm";

          await upload(
            new File(
              [blob],
              `voice-${Date.now()}.${extension}`,
              {
                type,
              },
            ),
          );
        };

      discardVoiceRef.current =
        false;

      recorder.start();

      setRecordingSeconds(0);
      setRecording(true);
      setOpen(null);
    } catch (error) {
      flash(
        error instanceof
            DOMException &&
          error.name ===
            "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access and try again."
          : error instanceof Error
            ? error.message
            : "Could not start microphone",
      );
    }
  }

  const cancelVoice = () => {
    if (!recording) return;

    discardVoiceRef.current =
      true;

    recorderRef.current?.stop();
  };

  const keyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      void submit();
    }
  };

  return (
    <div
      className="composer-zone"
      ref={rootRef}
    >
      {notice && (
        <div className="composer-notice">
          {notice}
        </div>
      )}

      {open === "ai" && (
        <AiMenu
          onClose={() =>
            setOpen(null)
          }
        />
      )}

      {open === "commands" && (
        <CommandPicker
          onSelect={(action) => {
            if (
              action === "task"
            ) {
              setOpen(
                "create-task",
              );
            } else if (
              action === "upload"
            ) {
              setOpen(
                "attachment",
              );
            } else if (
              action ===
              "mention"
            ) {
              setOpen(
                "mention",
              );
            } else if (
              action === "emoji"
            ) {
              setOpen("emoji");
            } else if (
              action ===
              "task-picker"
            ) {
              setOpen(
                "task-picker",
              );
            } else if (
              action ===
              "whiteboard"
            ) {
              setOpen(
                "whiteboard",
              );
            } else if (
              action === "clip"
            ) {
              setOpen("clip");
            }
          }}
        />
      )}

      {open === "plus" && (
        <ComposerPlusMenu
          onAction={(action) => {
            if (
              action ===
              "upload"
            ) {
              setOpen(
                "attachment",
              );
            } else if (
              action === "task"
            ) {
              setOpen(
                "create-task",
              );
            } else if (
              action ===
              "whiteboard"
            ) {
              setOpen(
                "whiteboard",
              );
            } else if (
              action === "clip"
            ) {
              setOpen("clip");
            } else if (
              action ===
              "share-task"
            ) {
              setOpen(
                "task-picker",
              );
            } else {
              flash(
                `${action.replace(
                  "-",
                  " ",
                )} requires its Rundesk module`,
              );
            }
          }}
        />
      )}

      {open ===
        "attachment" && (
        <AttachmentMenu
          onFile={upload}
        />
      )}

      {open ===
        "task-picker" && (
        <TaskPicker
          tasks={tasks}
          onSelect={(name) =>
            insert(
              `[Task: ${name}]`,
            )
          }
        />
      )}

      {open === "mention" && (
        <MentionPicker
          users={users}
          currentUserId={
            currentUser.id
          }
          onSelect={(name) =>
            insert(`@${name}`)
          }
        />
      )}

      {open === "emoji" && (
        <EmojiPicker
          onSelect={insert}
        />
      )}

      {open === "clip" && (
        <ClipRecorderMenu />
      )}

      {open ===
        "create-task" && (
        <form
          className="popover mini-modal"
          onSubmit={createTask}
        >
          <header>
            <h2>
              Create Task
            </h2>

            <button
              type="button"
              onClick={() =>
                setOpen(null)
              }
            >
              <X size={16} />
            </button>
          </header>

          <label>
            Task name

            <input
              autoFocus
              required
              value={
                task.title
              }
              onChange={(e) =>
                setTask(
                  (current) => ({
                    ...current,

                    title:
                      e.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <label>
            Description

            <textarea
              value={
                task.description
              }
              onChange={(e) =>
                setTask(
                  (current) => ({
                    ...current,

                    description:
                      e.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <label>
            Assignee

            <select
              value={
                task
                  .assigneeIds[0] ??
                ""
              }
              onChange={(e) =>
                setTask(
                  (current) => ({
                    ...current,

                    assigneeIds:
                      e.target.value
                        ? [
                            e.target
                              .value,
                          ]
                        : [],
                  }),
                )
              }
            >
              <option value="">
                Unassigned
              </option>

              {users.map(
                (user) => (
                  <option
                    value={
                      user.id
                    }
                    key={
                      user.id
                    }
                  >
                    {user.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Status

            <select
              value={
                task.status
              }
              onChange={(e) =>
                setTask(
                  (current) => ({
                    ...current,

                    status:
                      e.target
                        .value as Task["status"],
                  }),
                )
              }
            >
              <option>
                TODO
              </option>

              <option>
                IN_PROGRESS
              </option>

              <option>
                COMPLETE
              </option>
            </select>
          </label>

          <label>
            Priority

            <select
              value={
                task.priority
              }
              onChange={(e) =>
                setTask(
                  (current) => ({
                    ...current,

                    priority:
                      e.target
                        .value as Task["priority"],
                  }),
                )
              }
            >
              <option>
                LOW
              </option>

              <option>
                NORMAL
              </option>

              <option>
                HIGH
              </option>

              <option>
                URGENT
              </option>
            </select>
          </label>

          <label>
            Due date

            <input
              type="date"
              value={
                task.dueDate
              }
              onChange={(e) =>
                setTask(
                  (current) => ({
                    ...current,

                    dueDate:
                      e.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <button className="primary-button">
            Create Task
          </button>
        </form>
      )}

      {open ===
        "whiteboard" && (
        <section className="popover mini-modal whiteboard-modal">
          <header>
            <h2>
              Create new
              whiteboard
            </h2>

            <button
              onClick={() =>
                setOpen(null)
              }
            >
              <X size={16} />
            </button>
          </header>

          <p className="placeholder-copy">
            Open the Rundesk
            Whiteboards module to
            create a board.
          </p>
        </section>
      )}

      {open === "send" && (
        <section className="popover send-menu">
          <button
            onClick={() =>
              void submit()
            }
          >
            Send now
          </button>

          <button
            onClick={() =>
              flash(
                "Scheduling is stored only after a worker is configured",
              )
            }
          >
            Schedule message
          </button>
        </section>
      )}

      <div className="composer-box">
        {formatting && (
          <div className="formatting-toolbar">
            <button
              onClick={() =>
                wrap("**")
              }
            >
              B
            </button>

            <button
              onClick={() =>
                wrap("_")
              }
            >
              <i>I</i>
            </button>

            <button
              onClick={() =>
                wrap(
                  "<u>",
                  "</u>",
                )
              }
            >
              <u>U</u>
            </button>

            <button
              onClick={() =>
                wrap("~~")
              }
            >
              <s>S</s>
            </button>

            <button
              onClick={() =>
                wrap("`")
              }
            >
              Code
            </button>

            <button
              onClick={() =>
                wrap(
                  "```\n",
                  "\n```",
                )
              }
            >
              Block
            </button>

            <button
              onClick={() =>
                wrap("- ", "")
              }
            >
              • List
            </button>

            <button
              onClick={() =>
                wrap("1. ", "")
              }
            >
              1. List
            </button>

            <button
              onClick={() =>
                wrap("> ", "")
              }
            >
              Quote
            </button>

            <button
              onClick={() =>
                wrap(
                  "[",
                  "](https://)",
                )
              }
            >
              Link
            </button>
          </div>
        )}

        {attachments.length >
          0 && (
          <div className="pending-attachments">
            {attachments.map(
              (file) => (
                <span
                  className={
                    file.mimeType.startsWith(
                      "audio/",
                    )
                      ? "pending-file pending-audio"
                      : "pending-file"
                  }
                  key={
                    file.storageKey
                  }
                >
                  {file.mimeType.startsWith(
                    "audio/",
                  ) && (
                    <audio
                      controls
                      preload="metadata"
                      src={
                        file.url
                      }
                    />
                  )}

                  <b>
                    {
                      file.originalName
                    }
                  </b>

                  <button
                    type="button"
                    aria-label={`Remove ${file.originalName}`}
                    onClick={() =>
                      setAttachments(
                        (
                          current,
                        ) =>
                          current.filter(
                            (
                              item,
                            ) =>
                              item.storageKey !==
                              file.storageKey,
                          ),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ),
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            const next =
              e.target.value;

            update(next);

            if (
              next.endsWith("@")
            ) {
              setOpen(
                "mention",
              );
            } else if (
              /(^|\s)\/$/.test(
                next,
              )
            ) {
              setOpen(
                "commands",
              );
            }
          }}
          onKeyDown={keyDown}
          placeholder={`Write to ${channelName}, press 'space' for AI, '/' for commands`}
          rows={2}
        />

        <div className="composer-bottom">
          <ComposerToolbar
            open={open}
            toggle={toggle}
            onFormatting={() =>
              setFormatting(
                (current) =>
                  !current,
              )
            }
          />

          <div className="send-controls">
            {recording && (
              <>
                <span className="recording-timer">
                  <i />

                  {" "}
                  {String(
                    Math.floor(
                      recordingSeconds /
                        60,
                    ),
                  ).padStart(
                    2,
                    "0",
                  )}
                  :
                  {String(
                    recordingSeconds %
                      60,
                  ).padStart(
                    2,
                    "0",
                  )}
                </span>

                <button
                  className="voice-cancel"
                  title="Discard recording"
                  onClick={
                    cancelVoice
                  }
                >
                  <X size={14} />
                </button>
              </>
            )}

            <button
              className={`toolbar-button voice-button ${
                recording
                  ? "recording"
                  : ""
              }`}
              title={
                recording
                  ? "Stop and attach voice recording"
                  : "Record voice message"
              }
              onClick={() =>
                void toggleVoice()
              }
            >
              {recording ? (
                <Square
                  size={15}
                />
              ) : (
                <Mic size={18} />
              )}
            </button>

            <div
              className={`send-split ${
                value.trim() ||
                attachments.length
                  ? "ready"
                  : ""
              }`}
            >
              <button
                disabled={
                  (!value.trim() &&
                    attachments.length ===
                      0) ||
                  sending
                }
                onClick={() =>
                  void submit()
                }
              >
                {sending ? (
                  <LoaderCircle
                    className="spin"
                    size={17}
                  />
                ) : (
                  <Send
                    size={17}
                  />
                )}
              </button>

              <button
                onClick={() =>
                  toggle("send")
                }
              >
                <ChevronDown
                  size={14}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}