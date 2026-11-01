use std::sync::{Arc, Condvar, Mutex};
use std::thread;

/// A background thread that runs one job whenever it was asked to, never two at once and never more than
/// one behind: requests that arrive while the job runs collapse into a single run afterwards. The job
/// reads the newest state when it starts, so the last request is always covered and an older state can
/// never be written after a newer one.
pub struct SaveWriter {
    shared: Arc<Shared>,
}

struct Shared {
    wanted: Mutex<bool>,
    wake: Condvar,
}

impl SaveWriter {
    pub fn start(name: &str, job: impl Fn() + Send + 'static) -> Self {
        let shared = Arc::new(Shared {
            wanted: Mutex::new(false),
            wake: Condvar::new(),
        });
        let worker = Arc::clone(&shared);
        let spawned = thread::Builder::new().name(name.to_string()).spawn(move || loop {
            {
                let mut wanted = worker.wanted.lock().unwrap_or_else(|e| e.into_inner());
                while !*wanted {
                    wanted = worker.wake.wait(wanted).unwrap_or_else(|e| e.into_inner());
                }
                *wanted = false;
            }
            job();
        });
        if let Err(e) = spawned {
            log::error!("could not start the {name} thread: {e}");
        }
        Self { shared }
    }

    /// Asks for a run and returns at once.
    pub fn request(&self) {
        *self.shared.wanted.lock().unwrap_or_else(|e| e.into_inner()) = true;
        self.shared.wake.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, Instant};

    fn wait_until(what: &str, mut done: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !done() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn request_returns_at_once_even_while_the_job_is_slow() {
        let (started_tx, started_rx) = std::sync::mpsc::channel::<()>();
        let release = Arc::new((Mutex::new(false), Condvar::new()));
        let gate = Arc::clone(&release);
        let writer = SaveWriter::start("test-slow", move || {
            let _ = started_tx.send(());
            let (lock, cv) = &*gate;
            let mut open = lock.lock().unwrap();
            while !*open {
                open = cv.wait(open).unwrap();
            }
        });
        writer.request();
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let began = Instant::now();
        for _ in 0..1000 {
            writer.request();
        }
        assert!(began.elapsed() < Duration::from_millis(500), "request blocked on the running job");
        let (lock, cv) = &*release;
        *lock.lock().unwrap() = true;
        cv.notify_all();
    }

    #[test]
    fn requests_during_a_run_collapse_into_one_more_run_that_sees_the_latest_state() {
        let state = Arc::new(AtomicUsize::new(0));
        let written = Arc::new(Mutex::new(Vec::<usize>::new()));
        let (state_c, written_c) = (Arc::clone(&state), Arc::clone(&written));
        let (hold_tx, hold_rx) = std::sync::mpsc::channel::<()>();
        let hold_rx = Mutex::new(hold_rx);
        let writer = SaveWriter::start("test-coalesce", move || {
            let snapshot = state_c.load(Ordering::SeqCst);
            written_c.lock().unwrap().push(snapshot);
            let _ = hold_rx.lock().unwrap().recv_timeout(Duration::from_millis(300));
        });
        state.store(1, Ordering::SeqCst);
        writer.request();
        wait_until("the first run", || !written.lock().unwrap().is_empty());
        for n in 2..=50 {
            state.store(n, Ordering::SeqCst);
            writer.request();
        }
        drop(hold_tx);
        wait_until("the last state to be written", || written.lock().unwrap().last() == Some(&50));
        let runs = written.lock().unwrap().clone();
        assert!(runs.len() <= 3, "49 requests during one run collapsed into {} runs: {runs:?}", runs.len());
        assert!(runs.windows(2).all(|w| w[0] <= w[1]), "an older state was written after a newer one: {runs:?}");
    }
}
