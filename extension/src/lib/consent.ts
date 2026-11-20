import browser from "webextension-polyfill";

export type DataCollectionType =
  | "authenticationInfo"
  | "browsingActivity"
  | "websiteContent";

export async function requestDataConsent(
  types: DataCollectionType[],
): Promise<boolean> {
  try {
    const granted = (await browser.permissions.getAll()) as unknown as {
      data_collection?: string[];
    };
    const missing = types.filter(
      (type) => !(granted.data_collection ?? []).includes(type),
    );
    if (missing.length === 0) return true;
    return await browser.permissions.request({
      data_collection: missing,
    } as unknown as Parameters<typeof browser.permissions.request>[0]);
  } catch {
    return false;
  }
}