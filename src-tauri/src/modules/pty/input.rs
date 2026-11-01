use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

/// What may wait to be written to one PTY. A program that stops reading fills the kernel buffer and
/// blocks the write; this is how much more the app holds for it before it refuses new input.
pub const MAX_PENDING_BYTES: usize = 4 * 1024 * 1024;

type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;

/// The input side of one PTY: `push` hands the bytes to a thread of the session that does the
/// blocking write, in the order they were pushed. The caller (the IPC command, which runs on the
/// thread that paints and handles input) never waits on a child that has stopped reading.
pub struct InputQueue {
    tx: Sender<Vec<u8>>,
    pending: Arc<AtomicUsize>,
}

impl InputQueue {
    pub fn start(writer: SharedWriter) -> Self {
        let (tx, rx) = channel::<Vec<u8>>();
        let pending = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&pending);
        let spawned = thread::Builder::new().name("kex-pty-input".into()).spawn(move || {
            // Ends when the session drops its sender.
            for chunk in rx {
                let result = writer.lock().unwrap_or_else(|e| e.into_inner()).write_all(&chunk);
                counted.fetch_sub(chunk.len(), Ordering::SeqCst);
                if let Err(e) = result {
                    // EPIPE is expected if the child already exited.
                    log::debug!("pty input write failed: {e}");
                }
            }
        });
        if let Err(e) = spawned {
            log::error!("could not start the pty input thread: {e}");
        }
        Self { tx, pending }
    }

    pub fn push(&self, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty() {
            return Ok(());
        }
        let queued = self.pending.fetch_add(bytes.len(), Ordering::SeqCst);
        if queued + bytes.len() > MAX_PENDING_BYTES {
            self.pending.fetch_sub(bytes.len(), Ordering::SeqCst);
            return Err("the program is not reading its input; the text was dropped".to_string());
        }
        if self.tx.send(bytes.to_vec()).is_err() {
            self.pending.fetch_sub(bytes.len(), Ordering::SeqCst);
            return Err("the terminal input is closed".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Condvar;
    use std::time::{Duration, Instant};

    /// A writer standing in for a PTY whose child has stopped reading until `open` is set.
    struct Gated {
        open: Arc<(Mutex<bool>, Condvar)>,
        sink: Arc<Mutex<Vec<u8>>>,
    }

    impl Write for Gated {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            let (lock, cv) = &*self.open;
            let mut open = lock.lock().unwrap();
            while !*open {
                open = cv.wait(open).unwrap();
            }
            self.sink.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    type Gate = Arc<(Mutex<bool>, Condvar)>;

    fn gated() -> (InputQueue, Gate, Arc<Mutex<Vec<u8>>>, SharedWriter) {
        let open = Arc::new((Mutex::new(false), Condvar::new()));
        let sink = Arc::new(Mutex::new(Vec::new()));
        let writer: SharedWriter = Arc::new(Mutex::new(Box::new(Gated {
            open: Arc::clone(&open),
            sink: Arc::clone(&sink),
        })));
        (InputQueue::start(Arc::clone(&writer)), open, sink, writer)
    }

    fn release(open: &Gate) {
        let (lock, cv) = &**open;
        *lock.lock().unwrap() = true;
        cv.notify_all();
    }

    fn wait_for(what: &str, mut done: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !done() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn push_returns_at_once_while_the_child_is_not_reading_and_the_order_survives() {
        let (queue, open, sink, _writer) = gated();
        let began = Instant::now();
        for i in 0..200u8 {
            queue.push(&[b'a' + (i % 26)]).unwrap();
        }
        assert!(began.elapsed() < Duration::from_millis(500), "push waited for the child");
        assert!(sink.lock().unwrap().is_empty());
        release(&open);
        wait_for("all the bytes", || sink.lock().unwrap().len() == 200);
        let expected: Vec<u8> = (0..200u8).map(|i| b'a' + (i % 26)).collect();
        assert_eq!(*sink.lock().unwrap(), expected);
    }

    #[test]
    fn input_beyond_the_cap_is_refused_instead_of_growing_without_end() {
        let (queue, open, sink, _writer) = gated();
        let block = vec![b'x'; 1024 * 1024];
        let mut accepted = 0;
        let mut refused = false;
        for _ in 0..10 {
            match queue.push(&block) {
                Ok(()) => accepted += 1,
                Err(e) => {
                    assert!(e.contains("not reading"));
                    refused = true;
                    break;
                }
            }
        }
        assert!(refused, "ten MiB were accepted for a child that reads nothing");
        assert!(accepted * block.len() <= MAX_PENDING_BYTES + block.len());
        release(&open);
        wait_for("the accepted bytes", || sink.lock().unwrap().len() == accepted * block.len());
        // Once the child reads again the room is back.
        wait_for("room", || queue.push(b"ok").is_ok());
    }

    #[test]
    fn the_thread_ends_with_the_queue_and_lets_go_of_the_writer() {
        let (queue, open, _sink, writer) = gated();
        release(&open);
        queue.push(b"x").unwrap();
        drop(queue);
        wait_for("the thread to release the writer", || Arc::strong_count(&writer) == 1);
    }
}
