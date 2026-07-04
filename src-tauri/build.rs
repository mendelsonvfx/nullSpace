fn main() {
    // Without this, Cargo doesn't know updater.rs's option_env!("UPDATE_TOKEN") depends on
    // this env var, so a warm build cache could ship a stale token after rotating the secret.
    println!("cargo:rerun-if-env-changed=UPDATE_TOKEN");

    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("icons/icon.ico");
        res.compile().unwrap();
    }
    tauri_build::build()
}
