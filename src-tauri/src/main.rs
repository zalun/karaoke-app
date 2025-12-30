// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // On Linux, disable the DMABuf renderer in WebKitGTK to fix choppy video
    // playback in secondary windows. The DMABuf renderer has known issues with
    // video rendering across multiple webviews. This forces WebKitGTK to use
    // an alternative rendering path that handles multi-window video better.
    // See: https://github.com/zalun/karaoke-app/issues/100
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    homekaraoke_lib::run();
}
