// Toolchain probe only. No OAR UI, accounts, database, permissions or network.
#include <android/native_activity.h>
#include <android/native_window.h>
#include <stdint.h>

static void paint(ANativeActivity*, ANativeWindow* window) {
    ANativeWindow_setBuffersGeometry(window, 0, 0, WINDOW_FORMAT_RGBA_8888);
    ANativeWindow_Buffer buffer;
    if (ANativeWindow_lock(window, &buffer, nullptr) != 0) return;
    for (int y=0; y<buffer.height; ++y) {
        auto row = static_cast<uint32_t*>(buffer.bits) + y * buffer.stride;
        for (int x=0; x<buffer.width; ++x)
            row[x] = y < buffer.height/3 ? 0xff332211 : y < buffer.height*2/3 ? 0xff887744 : 0xff334422;
    }
    ANativeWindow_unlockAndPost(window);
}
extern "C" __attribute__((visibility("default"))) void ANativeActivity_onCreate(ANativeActivity* activity, void*, size_t) {
    activity->callbacks->onNativeWindowCreated = paint;
    activity->callbacks->onNativeWindowResized = paint;
    activity->callbacks->onNativeWindowRedrawNeeded = paint;
}
