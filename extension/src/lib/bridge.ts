import browser from "webextension-polyfill";

export interface BridgeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function sendNative<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<BridgeResponse<T>> {
  try {
    const response = (await browser.runtime.sendNativeMessage("nullsec_bridge", {
      command,
      ...payload,
    })) as BridgeResponse<T>;
    return response ?? { ok: false, error: "Empty native response" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Native bridge unavailable",
    };
  }
}

export function bridgeAvailable(): boolean {
  return typeof browser.runtime.sendNativeMessage === "function";
}