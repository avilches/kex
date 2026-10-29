use std::backtrace::Backtrace;
use std::panic::PanicHookInfo;

pub fn describe(
    message: &str,
    location: Option<(&str, u32, u32)>,
    thread: &str,
    backtrace: &str,
) -> String {
    let at = match location {
        Some((file, line, column)) => format!("{file}:{line}:{column}"),
        None => "unknown location".to_string(),
    };
    format!("[panic] thread '{thread}' panicked at {at}: {message}\n{backtrace}")
}

fn payload_message(info: &PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    if let Some(text) = payload.downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = payload.downcast_ref::<String>() {
        text.clone()
    } else {
        "non-string panic payload".to_string()
    }
}

/// The release profile aborts on panic, and the message only goes to stderr, which is
/// lost when Kex is launched from the Dock or with `open`. This keeps the previous hook
/// (stderr stays) and also writes the panic to Kex.log before the process dies.
pub fn install() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let text = describe(
            &payload_message(info),
            info.location().map(|l| (l.file(), l.line(), l.column())),
            thread.name().unwrap_or("unnamed"),
            &Backtrace::force_capture().to_string(),
        );
        log::error!("{text}");
        log::logger().flush();
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::{describe, install};
    use std::sync::Mutex;

    static CAPTURED: Mutex<Vec<String>> = Mutex::new(Vec::new());

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _: &log::Metadata) -> bool {
            true
        }
        fn log(&self, record: &log::Record) {
            CAPTURED.lock().unwrap().push(record.args().to_string());
        }
        fn flush(&self) {}
    }

    #[test]
    fn a_real_panic_reaches_the_logger() {
        log::set_logger(&Capture).unwrap();
        log::set_max_level(log::LevelFilter::Error);
        install();
        let _ = std::panic::catch_unwind(|| panic!("boom from the test"));
        let lines = CAPTURED.lock().unwrap();
        assert!(lines
            .iter()
            .any(|l| l.starts_with("[panic] thread ") && l.contains("boom from the test")));
    }

    #[test]
    fn names_thread_location_and_message() {
        let text = describe(
            "called `Option::unwrap()` on a `None` value",
            Some(("src/modules/pty/session.rs", 120, 9)),
            "kex-pty-reader",
            "0: frame",
        );
        assert_eq!(
            text,
            "[panic] thread 'kex-pty-reader' panicked at src/modules/pty/session.rs:120:9: \
             called `Option::unwrap()` on a `None` value\n0: frame"
        );
    }

    #[test]
    fn survives_a_missing_location() {
        let text = describe("boom", None, "main", "");
        assert!(text.contains("panicked at unknown location: boom"));
    }
}
