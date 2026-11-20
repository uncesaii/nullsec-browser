import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Challenge, RequestRecord } from "./types";

interface NullSecDB extends DBSchema {
  challenges: {
    key: string;
    value: Challenge;
    indexes: { "by-workspace": string };
  };
  requests: {
    key: string;
    value: RequestRecord;
    indexes: { "by-workspace-time": [string, string] };
  };
}

let database: Promise<IDBPDatabase<NullSecDB>> | undefined;

function db(): Promise<IDBPDatabase<NullSecDB>> {
  database ??= openDB<NullSecDB>("nullsec", 1, {
    upgrade(instance) {
      if (!instance.objectStoreNames.contains("challenges")) {
        const store = instance.createObjectStore("challenges", { keyPath: "id" });
        store.createIndex("by-workspace", "workspaceId");
      }
      if (!instance.objectStoreNames.contains("requests")) {
        const store = instance.createObjectStore("requests", { keyPath: "id" });
        store.createIndex("by-workspace-time", ["workspaceId", "time"]);
      }
    },
  });
  return database;
}

export async function listChallenges(workspaceId: string): Promise<Challenge[]> {
  const instance = await db();
  const challenges = await instance.getAllFromIndex(
    "challenges",
    "by-workspace",
    workspaceId,
  );
  return challenges.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getChallenge(id: string): Promise<Challenge | undefined> {
  return (await db()).get("challenges", id);
}

export async function putChallenge(challenge: Challenge): Promise<void> {
  await (await db()).put("challenges", challenge);
}

export async function deleteChallenge(id: string): Promise<void> {
  await (await db()).delete("challenges", id);
}

const MAX_REQUESTS_PER_WORKSPACE = 5000;

export async function addRequest(record: RequestRecord): Promise<void> {
  const instance = await db();
  await instance.put("requests", record);
  const all = await instance.getAllFromIndex(
    "requests",
    "by-workspace-time",
    IDBKeyRange.bound([record.workspaceId, ""], [record.workspaceId, "\uffff"]),
  );
  if (all.length > MAX_REQUESTS_PER_WORKSPACE) {
    const excess = all
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(0, all.length - MAX_REQUESTS_PER_WORKSPACE);
    const tx = instance.transaction("requests", "readwrite");
    for (const item of excess) {
      await tx.store.delete(item.id);
    }
    await tx.done;
  }
}

export async function listRequests(
  workspaceId: string,
  limit = 500,
): Promise<RequestRecord[]> {
  const instance = await db();
  const records = await instance.getAllFromIndex(
    "requests",
    "by-workspace-time",
    IDBKeyRange.bound([workspaceId, ""], [workspaceId, "\uffff"]),
  );
  return records.sort((a, b) => b.time.localeCompare(a.time)).slice(0, limit);
}

export async function clearRequests(workspaceId: string): Promise<void> {
  const instance = await db();
  const tx = instance.transaction("requests", "readwrite");
  const index = tx.store.index("by-workspace-time");
  let cursor = await index.openCursor(
    IDBKeyRange.bound([workspaceId, ""], [workspaceId, "\uffff"]),
  );
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}