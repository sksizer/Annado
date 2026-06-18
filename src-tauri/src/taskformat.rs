//! Task-format dialect layer: the single source of truth for recognizing (decode) and
//! emitting (encode) per-field markers across Annado, Obsidian Tasks (emoji), and Dataview
//! (inline-field) conventions.
//!
//! **Read any, write chosen:** `decode_*` recognizes a field in *all* dialects (one
//! alternation regex per field, so the format count is free); `encode_*` writes the one
//! chosen `TaskFormat`, falling back to the Annado marker only where the chosen format can't
//! express a field (Obsidian-Tasks has no time/duration concept).

use crate::parser::{self, WhenValue};
use crate::recurrence::Recurrence;
use chrono::NaiveDate;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskFormat {
    Annado,
    ObsidianTasks,
    Dataview,
}

impl Default for TaskFormat {
    fn default() -> Self {
        TaskFormat::Annado
    }
}

impl TaskFormat {
    pub fn from_config(s: &str) -> Self {
        match s {
            "obsidian_tasks" => TaskFormat::ObsidianTasks,
            "dataview" => TaskFormat::Dataview,
            _ => TaskFormat::Annado,
        }
    }
}

// ---- Decode regexes: Annado | Obsidian-Tasks emoji | Dataview, one per field ----

// Scheduled/when. Also reads Obsidian-Tasks 🛫 (start) and Dataview [start::] into `when`.
static WHEN_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@when\(([^)]+)\)|[⏳🛫]\s*(\d{4}-\d{2}-\d{2})|\[(?:scheduled|start)::\s*([^\]]+)\]")
        .unwrap()
});
static DUE_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@due\(([^)]+)\)|📅\s*(\d{4}-\d{2}-\d{2})|\[due::\s*([^\]]+)\]").unwrap()
});
static CREATED_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@created\(([^)]+)\)|➕\s*(\d{4}-\d{2}-\d{2})|\[created::\s*([^\]]+)\]").unwrap()
});
static COMPLETED_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@completed\(([^)]+)\)|✅\s*(\d{4}-\d{2}-\d{2})|\[completion::\s*([^\]]+)\]")
        .unwrap()
});
static PRIORITY_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"!\(([1-3])\)|(⏫|🔼|🔽|🔺|⏬)|\[priority::\s*(high|medium|low)\]").unwrap()
});
// Recurrence. The emoji rule runs until the next marker/special char (no closing delimiter),
// so the emoji branch captures everything that isn't another marker emoji, a bracket, #, @.
static REPEAT_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@repeat\(([^)]+)\)|🔁\s*([^📅⏳🛫➕✅🔁⏫🔼🔽🔺⏬\[\]#@\n]+)|\[repeat::\s*([^\]]+)\]")
        .unwrap()
});
// No emoji for time/duration (Obsidian-Tasks has no concept); Annado + Dataview only.
static DURATION_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@duration\(([^)]+)\)|\[duration::\s*([^\]]+)\]").unwrap()
});
static TIME_DECODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@time\(([^)]+)\)|\[time::\s*([^\]]+)\]").unwrap()
});

fn first_match<'a>(caps: &regex::Captures<'a>, idxs: &[usize]) -> Option<&'a str> {
    idxs.iter()
        .find_map(|&i| caps.get(i).map(|m| m.as_str()))
}

/// Decode the scheduled date / `when` value from any dialect.
pub fn decode_when(content: &str, today: NaiveDate) -> (WhenValue, String) {
    if let Some(caps) = WHEN_DECODE.captures(content) {
        let raw = first_match(&caps, &[1, 2, 3]).unwrap_or("").trim();
        let when = WhenValue::from_str(raw, today);
        let cleaned = WHEN_DECODE.replace(content, "").to_string();
        (when, cleaned.trim().to_string())
    } else {
        (WhenValue::Inbox, content.to_string())
    }
}

fn decode_date(re: &Regex, content: &str) -> (Option<String>, String) {
    if let Some(caps) = re.captures(content) {
        let v = first_match(&caps, &[1, 2, 3]).map(|s| s.trim().to_string());
        let cleaned = re.replace(content, "").to_string();
        (v, cleaned.trim().to_string())
    } else {
        (None, content.to_string())
    }
}

pub fn decode_due(content: &str) -> (Option<String>, String) {
    decode_date(&DUE_DECODE, content)
}
pub fn decode_created(content: &str) -> (Option<String>, String) {
    decode_date(&CREATED_DECODE, content)
}
pub fn decode_completed(content: &str) -> (Option<String>, String) {
    decode_date(&COMPLETED_DECODE, content)
}

/// Decode priority (Annado `!(1-3)`, Tasks `⏫/🔼/🔽` with `🔺/⏬` clamped, Dataview words).
pub fn decode_priority(content: &str) -> (Option<u8>, String) {
    if let Some(caps) = PRIORITY_DECODE.captures(content) {
        let p = if let Some(d) = caps.get(1) {
            d.as_str().parse::<u8>().ok()
        } else if let Some(e) = caps.get(2) {
            Some(match e.as_str() {
                "⏫" => 1,
                "🔼" => 2,
                "🔽" => 3,
                "🔺" => 1, // highest → clamp to high
                "⏬" => 3, // lowest → clamp to low
                _ => 2,
            })
        } else if let Some(w) = caps.get(3) {
            Some(match w.as_str() {
                "high" => 1,
                "medium" => 2,
                "low" => 3,
                _ => 2,
            })
        } else {
            None
        };
        let cleaned = PRIORITY_DECODE.replace(content, "").to_string();
        (p, cleaned.trim().to_string())
    } else {
        (None, content.to_string())
    }
}

/// Decode an inline recurrence rule from any dialect.
pub fn decode_recurrence(content: &str) -> (Option<Recurrence>, String) {
    if let Some(caps) = REPEAT_DECODE.captures(content) {
        let raw = first_match(&caps, &[1, 2, 3]).unwrap_or("").trim();
        let rec = crate::recurrence::parse_rule(raw);
        let cleaned = REPEAT_DECODE.replace(content, "").to_string();
        (Some(rec), cleaned.trim().to_string())
    } else {
        (None, content.to_string())
    }
}

pub fn decode_duration(content: &str) -> (Option<u32>, String) {
    if let Some(caps) = DURATION_DECODE.captures(content) {
        let raw = first_match(&caps, &[1, 2]).unwrap_or("");
        let v = parser::parse_duration_str(raw);
        let cleaned = DURATION_DECODE.replace(content, "").to_string();
        (v, cleaned.trim().to_string())
    } else {
        (None, content.to_string())
    }
}

pub fn decode_time(content: &str) -> (Option<String>, String) {
    if let Some(caps) = TIME_DECODE.captures(content) {
        let v = first_match(&caps, &[1, 2]).map(|s| s.trim().to_string());
        let cleaned = TIME_DECODE.replace(content, "").to_string();
        (v, cleaned.trim().to_string())
    } else {
        (None, content.to_string())
    }
}

// ---- Encode: emit a field's marker in the chosen format ----
//
// Each returns the marker string for a present value, or None when there's nothing to emit.
// Obsidian-Tasks emoji has no time/duration concept, so those fall back to the Annado marker.

/// Scheduled/when. Non-date values (evening/anytime/someday) can't be expressed as a bare
/// `⏳ <date>`, so under ObsidianTasks they fall back to the Annado `@when(...)` marker.
pub fn encode_when(when: &WhenValue, format: TaskFormat, today: NaiveDate) -> Option<String> {
    if *when == WhenValue::Inbox {
        return None;
    }
    let v = when.to_string_value(today);
    if v.is_empty() {
        return None;
    }
    Some(match format {
        TaskFormat::Annado => format!("@when({})", v),
        TaskFormat::ObsidianTasks => match when {
            WhenValue::Date(d) => format!("⏳ {}", d),
            _ => format!("@when({})", v),
        },
        TaskFormat::Dataview => format!("[scheduled:: {}]", v),
    })
}

pub fn encode_due(deadline: &Option<String>, format: TaskFormat) -> Option<String> {
    let d = deadline.as_ref()?;
    Some(match format {
        TaskFormat::Annado => format!("@due({})", d),
        TaskFormat::ObsidianTasks => format!("📅 {}", d),
        TaskFormat::Dataview => format!("[due:: {}]", d),
    })
}

pub fn encode_created(date: &Option<String>, format: TaskFormat) -> Option<String> {
    let d = date.as_ref()?;
    Some(match format {
        TaskFormat::Annado => format!("@created({})", d),
        TaskFormat::ObsidianTasks => format!("➕ {}", d),
        TaskFormat::Dataview => format!("[created:: {}]", d),
    })
}

pub fn encode_completed(date: &Option<String>, format: TaskFormat) -> Option<String> {
    let d = date.as_ref()?;
    Some(match format {
        TaskFormat::Annado => format!("@completed({})", d),
        TaskFormat::ObsidianTasks => format!("✅ {}", d),
        TaskFormat::Dataview => format!("[completion:: {}]", d),
    })
}

pub fn encode_priority(priority: Option<u8>, format: TaskFormat) -> Option<String> {
    let p = priority?;
    Some(match format {
        TaskFormat::Annado => format!("!({})", p),
        TaskFormat::ObsidianTasks => match p {
            1 => "⏫".to_string(),
            2 => "🔼".to_string(),
            _ => "🔽".to_string(),
        },
        TaskFormat::Dataview => {
            let word = match p {
                1 => "high",
                2 => "medium",
                _ => "low",
            };
            format!("[priority:: {}]", word)
        }
    })
}

pub fn encode_recurrence(rec: &Recurrence, format: TaskFormat) -> String {
    let rule = crate::recurrence::format_rule(rec);
    match format {
        TaskFormat::Annado => format!("@repeat({})", rule),
        TaskFormat::ObsidianTasks => format!("🔁 {}", rule),
        TaskFormat::Dataview => format!("[repeat:: {}]", rule),
    }
}

/// Time has no Obsidian-Tasks equivalent → falls back to the Annado `@time(...)` marker.
pub fn encode_time(time: &Option<String>, format: TaskFormat) -> Option<String> {
    let t = time.as_ref()?;
    Some(match format {
        TaskFormat::Dataview => format!("[time:: {}]", t),
        // Annado and the ObsidianTasks fallback both use @time.
        _ => format!("@time({})", t),
    })
}

/// Duration has no Obsidian-Tasks equivalent → falls back to the Annado `@duration(...)` marker.
pub fn encode_duration(minutes: Option<u32>, format: TaskFormat) -> Option<String> {
    let m = minutes?;
    let s = parser::format_duration(m);
    Some(match format {
        TaskFormat::Dataview => format!("[duration:: {}]", s),
        _ => format!("@duration({})", s),
    })
}

// ---- Detection: tally which dialect a vault's task lines predominantly use ----

// Per-dialect "signature" markers (tags/wikilinks are identical across formats, so excluded).
static ANNADO_SIG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"@(?:when|due|created|completed|time|duration|repeat)\(|!\([1-3]\)").unwrap()
});
static TASKS_SIG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[📅⏳🛫➕✅🔁⏫🔼🔽🔺⏬]").unwrap());
static DATAVIEW_SIG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[(?:due|scheduled|start|created|completion|priority|repeat|time|duration)::")
        .unwrap()
});

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionResult {
    pub suggested: TaskFormat,
    pub annado: usize,
    pub obsidian_tasks: usize,
    pub dataview: usize,
}

/// Tally recognized markers across task lines and suggest the dominant dialect.
/// Ties or no markers → Annado (the conservative default).
pub fn detect_format<'a>(lines: impl IntoIterator<Item = &'a str>) -> DetectionResult {
    let mut annado = 0usize;
    let mut tasks = 0usize;
    let mut dataview = 0usize;
    for line in lines {
        annado += ANNADO_SIG.find_iter(line).count();
        tasks += TASKS_SIG.find_iter(line).count();
        dataview += DATAVIEW_SIG.find_iter(line).count();
    }
    let suggested = if tasks > annado && tasks > dataview {
        TaskFormat::ObsidianTasks
    } else if dataview > annado && dataview > tasks {
        TaskFormat::Dataview
    } else {
        TaskFormat::Annado
    };
    DetectionResult {
        suggested,
        annado,
        obsidian_tasks: tasks,
        dataview,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recurrence::RecurrenceMode;

    const TODAY: fn() -> NaiveDate = || NaiveDate::from_ymd_opt(2026, 6, 17).unwrap();

    #[test]
    fn decode_due_all_dialects() {
        for line in [
            "Pay rent @due(2026-07-01)",
            "Pay rent 📅 2026-07-01",
            "Pay rent [due:: 2026-07-01]",
        ] {
            let (v, cleaned) = decode_due(line);
            assert_eq!(v.as_deref(), Some("2026-07-01"), "line: {line}");
            assert_eq!(cleaned, "Pay rent", "line: {line}");
        }
    }

    #[test]
    fn decode_when_reads_scheduled_and_start() {
        for line in [
            "Task @when(2026-07-01)",
            "Task ⏳ 2026-07-01",
            "Task 🛫 2026-07-01",
            "Task [scheduled:: 2026-07-01]",
            "Task [start:: 2026-07-01]",
        ] {
            let (v, _) = decode_when(line, TODAY());
            assert_eq!(v, WhenValue::Date("2026-07-01".to_string()), "line: {line}");
        }
    }

    #[test]
    fn decode_priority_all_dialects_with_clamp() {
        let cases = [
            ("a !(1)", 1u8),
            ("a ⏫", 1),
            ("a 🔼", 2),
            ("a 🔽", 3),
            ("a 🔺", 1), // highest clamps to high
            ("a ⏬", 3), // lowest clamps to low
            ("a [priority:: high]", 1),
            ("a [priority:: medium]", 2),
            ("a [priority:: low]", 3),
        ];
        for (line, expect) in cases {
            let (v, _) = decode_priority(line);
            assert_eq!(v, Some(expect), "line: {line}");
        }
    }

    #[test]
    fn decode_recurrence_all_dialects() {
        for line in [
            "Water @repeat(every 2 weeks)",
            "Water 🔁 every 2 weeks",
            "Water [repeat:: every 2 weeks]",
        ] {
            let (v, _) = decode_recurrence(line);
            let rec = v.expect("recurrence");
            assert_eq!(rec.interval, 2);
            assert_eq!(rec.unit, crate::parser::IntervalUnit::Weeks);
            assert_eq!(rec.mode, RecurrenceMode::Fixed);
        }
    }

    #[test]
    fn decode_emoji_recurrence_stops_at_next_marker() {
        // 🔁 rule followed by another emoji marker must not swallow it.
        let (v, _) = decode_recurrence("Water 🔁 every week 📅 2026-07-01");
        let rec = v.expect("recurrence");
        assert_eq!(rec.interval, 1);
        assert_eq!(rec.unit, crate::parser::IntervalUnit::Weeks);
        let (due, _) = decode_due("Water 🔁 every week 📅 2026-07-01");
        assert_eq!(due.as_deref(), Some("2026-07-01"));
    }

    #[test]
    fn decode_time_and_duration_annado_and_dataview() {
        assert_eq!(decode_time("a @time(09:00)").0.as_deref(), Some("09:00"));
        assert_eq!(decode_time("a [time:: 09:00]").0.as_deref(), Some("09:00"));
        assert_eq!(decode_duration("a @duration(1h30m)").0, Some(90));
        assert_eq!(decode_duration("a [duration:: 1h30m]").0, Some(90));
    }

    #[test]
    fn decode_created_and_completed_dialects() {
        assert_eq!(decode_created("a ➕ 2026-01-02").0.as_deref(), Some("2026-01-02"));
        assert_eq!(decode_created("a [created:: 2026-01-02]").0.as_deref(), Some("2026-01-02"));
        assert_eq!(decode_completed("a ✅ 2026-01-03").0.as_deref(), Some("2026-01-03"));
        assert_eq!(decode_completed("a [completion:: 2026-01-03]").0.as_deref(), Some("2026-01-03"));
    }

    #[test]
    fn unknown_markers_preserved() {
        // A foreign marker we don't recognize stays in the leftover content.
        let (v, cleaned) = decode_due("Task ⭐ 2026-07-01");
        assert_eq!(v, None);
        assert_eq!(cleaned, "Task ⭐ 2026-07-01");
    }

    const FORMATS: [TaskFormat; 3] =
        [TaskFormat::Annado, TaskFormat::ObsidianTasks, TaskFormat::Dataview];

    #[test]
    fn due_round_trips_in_every_format() {
        let due = Some("2026-07-01".to_string());
        for f in FORMATS {
            let marker = encode_due(&due, f).unwrap();
            let (decoded, _) = decode_due(&format!("Task {}", marker));
            assert_eq!(decoded, due, "format {:?} marker {}", f, marker);
        }
    }

    #[test]
    fn priority_round_trips_in_every_format() {
        for p in [1u8, 2, 3] {
            for f in FORMATS {
                let marker = encode_priority(Some(p), f).unwrap();
                let (decoded, _) = decode_priority(&format!("Task {}", marker));
                assert_eq!(decoded, Some(p), "p={} format={:?}", p, f);
            }
        }
    }

    #[test]
    fn recurrence_round_trips_in_every_format() {
        let rec = decode_recurrence("@repeat(every 2 weeks)").0.unwrap();
        for f in FORMATS {
            let marker = encode_recurrence(&rec, f);
            let (decoded, _) = decode_recurrence(&format!("Task {}", marker));
            let d = decoded.unwrap();
            assert_eq!(d.interval, 2);
            assert_eq!(d.unit, crate::parser::IntervalUnit::Weeks);
            assert_eq!(d.mode, RecurrenceMode::Fixed);
        }
    }

    #[test]
    fn when_round_trips_in_every_format() {
        let when = WhenValue::Date("2026-07-01".to_string());
        for f in FORMATS {
            let marker = encode_when(&when, f, TODAY()).unwrap();
            let (decoded, _) = decode_when(&format!("Task {}", marker), TODAY());
            assert_eq!(decoded, when, "format {:?}", f);
        }
    }

    #[test]
    fn cross_format_read_tasks_write_annado() {
        // Read an Obsidian-Tasks line, re-emit each field as Annado.
        let (due, _) = decode_due("Task 📅 2026-07-01");
        let (prio, _) = decode_priority("Task ⏫");
        assert_eq!(encode_due(&due, TaskFormat::Annado).as_deref(), Some("@due(2026-07-01)"));
        assert_eq!(encode_priority(prio, TaskFormat::Annado).as_deref(), Some("!(1)"));
    }

    #[test]
    fn time_and_duration_fall_back_to_annado_under_tasks() {
        let time = Some("09:00".to_string());
        let dur = Some(90u32);
        assert_eq!(
            encode_time(&time, TaskFormat::ObsidianTasks).as_deref(),
            Some("@time(09:00)")
        );
        assert_eq!(
            encode_duration(dur, TaskFormat::ObsidianTasks).as_deref(),
            Some("@duration(1h30m)")
        );
        // Dataview expresses them natively.
        assert_eq!(
            encode_time(&time, TaskFormat::Dataview).as_deref(),
            Some("[time:: 09:00]")
        );
        assert_eq!(
            encode_duration(dur, TaskFormat::Dataview).as_deref(),
            Some("[duration:: 1h30m]")
        );
    }

    #[test]
    fn detect_pure_tasks_vault() {
        let lines = vec![
            "- [ ] Pay rent 📅 2026-07-01 ⏫",
            "- [ ] Water plants 🔁 every 2 weeks ⏳ 2026-06-20",
        ];
        assert_eq!(detect_format(lines).suggested, TaskFormat::ObsidianTasks);
    }

    #[test]
    fn detect_pure_dataview_vault() {
        let lines = vec![
            "- [ ] Pay rent [due:: 2026-07-01] [priority:: high]",
            "- [ ] Review [scheduled:: 2026-06-20]",
        ];
        assert_eq!(detect_format(lines).suggested, TaskFormat::Dataview);
    }

    #[test]
    fn detect_mixed_picks_dominant() {
        let lines = vec![
            "- [ ] a 📅 2026-07-01",
            "- [ ] b 📅 2026-07-02 ⏫",
            "- [ ] c @due(2026-07-03)",
        ];
        // 3 Tasks markers vs 1 Annado → ObsidianTasks.
        assert_eq!(detect_format(lines).suggested, TaskFormat::ObsidianTasks);
    }

    #[test]
    fn encode_created_completed_per_format_for_watcher_stamps() {
        let d = Some("2026-06-17".to_string());
        assert_eq!(encode_created(&d, TaskFormat::Annado).as_deref(), Some("@created(2026-06-17)"));
        assert_eq!(encode_created(&d, TaskFormat::ObsidianTasks).as_deref(), Some("➕ 2026-06-17"));
        assert_eq!(encode_created(&d, TaskFormat::Dataview).as_deref(), Some("[created:: 2026-06-17]"));
        assert_eq!(encode_completed(&d, TaskFormat::Annado).as_deref(), Some("@completed(2026-06-17)"));
        assert_eq!(encode_completed(&d, TaskFormat::ObsidianTasks).as_deref(), Some("✅ 2026-06-17"));
        assert_eq!(encode_completed(&d, TaskFormat::Dataview).as_deref(), Some("[completion:: 2026-06-17]"));
    }

    #[test]
    fn detect_empty_or_tie_defaults_annado() {
        assert_eq!(detect_format(Vec::<&str>::new()).suggested, TaskFormat::Annado);
        // tasks == dataview, both > annado → tie → Annado.
        let lines = vec!["- [ ] a 📅 2026-07-01 [due:: 2026-07-01]"];
        assert_eq!(detect_format(lines).suggested, TaskFormat::Annado);
    }
}
