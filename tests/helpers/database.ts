import { resetDatabaseHandleForTests } from "@/lib/storage/guest-store";

export const DATABASE_NAME = "out-of-book";

export function deleteDatabase(name = DATABASE_NAME): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Drops both the cached connection and the stored data, so each test starts on an empty store. */
export async function resetDatabase(): Promise<void> {
  await resetDatabaseHandleForTests();
  await deleteDatabase();
}
