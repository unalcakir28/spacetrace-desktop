// Hide the console window on Windows in a release build: this is a GUI app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    spacetrace_desktop_lib::run()
}
