import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Repertoire, ReviewState, TrainingSession } from "@/lib/chess/types";

interface GuestDatabase extends DBSchema {
  repertoires: { key: string; value: Repertoire };
  sessions: { key: string; value: TrainingSession; indexes: { "by-updated": string } };
  learning: {
    key: string;
    value: ReviewState;
    indexes: { "by-repertoire": string; "by-due": [string, string] };
  };
}

const DB_VERSION = 2;

let database: Promise<IDBPDatabase<GuestDatabase>> | undefined;

function db(): Promise<IDBPDatabase<GuestDatabase>> {
  if (!database) {
    database = openDB<GuestDatabase>("out-of-book", DB_VERSION, {
      upgrade(handle, oldVersion) {
        if (oldVersion < 1) {
          handle.createObjectStore("repertoires", { keyPath: "id" });
          const sessions = handle.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("by-updated", "updatedAt");
        }
        if (oldVersion < 2) {
          // "outbox" predates this schema and is no longer typed on GuestDatabase; drop it via the raw API.
          const raw = handle as unknown as IDBDatabase;
          if (raw.objectStoreNames.contains("outbox")) raw.deleteObjectStore("outbox");
          const learning = handle.createObjectStore("learning", { keyPath: "id" });
          learning.createIndex("by-repertoire", "repertoireId");
          learning.createIndex("by-due", ["repertoireId", "due"]);
        }
      },
    });
  }
  return database;
}

export async function listRepertoires(): Promise<Repertoire[]> {
  return (await db()).getAll("repertoires");
}

export async function saveRepertoire(repertoire: Repertoire): Promise<void> {
  await (await db()).put("repertoires", repertoire);
}

export async function deleteRepertoire(id: string): Promise<void> {
  const handle = await db();
  await handle.delete("repertoires", id);
  const states = await handle.getAllFromIndex("learning", "by-repertoire", id);
  await Promise.all(states.map((state) => handle.delete("learning", state.id)));
}

export async function saveSession(session: TrainingSession): Promise<void> {
  await (await db()).put("sessions", session);
}

export async function getLatestActiveSession(): Promise<TrainingSession | undefined> {
  const sessions = await (await db()).getAllFromIndex("sessions", "by-updated");
  return sessions.reverse().find((session) => session.phase !== "review" && session.phase !== "complete");
}

export async function listAllReviewStates(): Promise<ReviewState[]> {
  return (await db()).getAll("learning");
}

/** One transaction for a whole line's grades: a partially written batch would leave the schedule inconsistent. */
export async function saveReviewStates(states: ReviewState[]): Promise<void> {
  const handle = await db();
  const tx = handle.transaction("learning", "readwrite");
  await Promise.all([...states.map((state) => tx.store.put(state)), tx.done]);
}

export async function resetDatabaseHandleForTests(): Promise<void> {
  const current = database;
  database = undefined;
  if (!current) return;
  try {
    (await current).close();
  } catch {
    // Connection never opened successfully — nothing to close.
  }
}
