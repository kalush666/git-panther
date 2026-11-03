//! Parses the progress lines git prints to stderr with `--progress`.

use std::io::Read;
use std::sync::mpsc::Sender;

use panther_domain::repository::CloneProgress;

/// Parses lines such as `Receiving objects:  45% (450/1000), 1.2 MiB | 2 MiB/s`
/// or `remote: Counting objects: 10% (1/10)`. Returns `None` for other output.
pub fn parse_progress_line(line: &str) -> Option<CloneProgress> {
    let line = line.strip_prefix("remote:").unwrap_or(line).trim();
    let (phase, rest) = line.split_once(':')?;
    let (percent_text, _) = rest.split_once('%')?;
    let percent = percent_text.trim().parse::<u8>().ok()?.min(100);
    Some(CloneProgress {
        phase: phase.trim().to_owned(),
        percent: Some(percent),
    })
}

/// Streams `source` line by line into `lines`. Git redraws progress with
/// carriage returns, so both `\r` and `\n` end a line.
pub fn forward_lines(mut source: impl Read, lines: &Sender<String>) {
    let mut pending = Vec::new();
    let mut buffer = [0_u8; 4096];
    while let Ok(read) = source.read(&mut buffer) {
        if read == 0 {
            break;
        }
        for &byte in &buffer[..read] {
            if byte == b'\r' || byte == b'\n' {
                send_line(&mut pending, lines);
            } else {
                pending.push(byte);
            }
        }
    }
    send_line(&mut pending, lines);
}

fn send_line(pending: &mut Vec<u8>, lines: &Sender<String>) {
    let line = String::from_utf8_lossy(pending).trim().to_owned();
    pending.clear();
    if !line.is_empty() {
        // The receiver only disappears once the clone is finished or
        // cancelled, at which point remaining output is irrelevant.
        let _ = lines.send(line);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;

    use super::*;

    #[test]
    fn parses_local_phase() {
        let progress =
            parse_progress_line("Receiving objects:  45% (450/1000), 1.20 MiB | 2.00 MiB/s")
                .unwrap();
        assert_eq!(progress.phase, "Receiving objects");
        assert_eq!(progress.percent, Some(45));
    }

    #[test]
    fn parses_remote_phase() {
        let progress =
            parse_progress_line("remote: Counting objects: 100% (10/10), done.").unwrap();
        assert_eq!(progress.phase, "Counting objects");
        assert_eq!(progress.percent, Some(100));
    }

    #[test]
    fn ignores_non_progress_output() {
        assert_eq!(parse_progress_line("Cloning into 'app'..."), None);
        assert_eq!(parse_progress_line("fatal: repository not found"), None);
    }

    #[test]
    fn splits_on_carriage_returns_and_newlines() {
        let (sender, receiver) = mpsc::channel();
        forward_lines(&b"a: 1% (1/9)\ra: 50% (5/9)\r\nfatal: x\n"[..], &sender);
        drop(sender);
        let lines: Vec<String> = receiver.iter().collect();
        assert_eq!(lines, ["a: 1% (1/9)", "a: 50% (5/9)", "fatal: x"]);
    }
}
