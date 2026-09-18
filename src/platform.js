import { Capacitor } from "@capacitor/core";
export const isDesktop = typeof window !== "undefined" && !!window.oarDesktop;
export const isMobile = Capacitor.isNativePlatform();
export const isNative = isDesktop || isMobile;
export async function connection() {
  if (isDesktop) return window.oarDesktop.connection();
  return { mode: "unimplemented", platform: Capacitor.getPlatform() };
}
export async function nativeRequest(route, options = {}) {
  if (isDesktop) {
    let result;
    try {
      result = await window.oarDesktop.request(route, options);
    } catch (error) {
      throw new Error(
        error.message.replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          "",
        ),
      );
    }
    if (result?.$oarError)
      throw Object.assign(new Error(result.$oarError.message), {
        fields: result.$oarError.fields,
      });
    return result;
  }
  throw Error("The mobile local database implementation is not ready.");
}
export async function exportNative(name, text) {
  if (isDesktop) return window.oarDesktop.exportLog(name, text);
  throw Error("The mobile local database implementation is not ready.");
}
