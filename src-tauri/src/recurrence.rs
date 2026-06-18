use crate::parser::IntervalUnit;
use chrono::{Months, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecurrenceMode {
    Fixed,    // next occurrence measured from the scheduled date
    WhenDone, // next occurrence measured from the completion date
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recurrence {
    pub interval: u32,
    pub unit: IntervalUnit,
    pub mode: RecurrenceMode,
    /// Set when the rule is outside Annado's modeled subset (e.g. "every weekday").
    /// When present, the rule is round-tripped verbatim and Annado does not advance it.
    pub raw: Option<String>,
}

/// Parse a recurrence rule string ("every 2 weeks", "every week when done",
/// "every weekday") into a Recurrence. Rules outside the modeled subset are kept raw.
pub fn parse_rule(input: &str) -> Recurrence {
    let s = input.trim();
    let lower = s.to_lowercase();
    let (body, when_done) = match lower.strip_suffix(" when done") {
        Some(b) => (b.trim(), true),
        None => (lower.as_str(), false),
    };
    let mode = if when_done {
        RecurrenceMode::WhenDone
    } else {
        RecurrenceMode::Fixed
    };
    // Expect: "every [N] <unit>"
    if let Some(rest) = body.strip_prefix("every ") {
        let toks: Vec<&str> = rest.split_whitespace().collect();
        let (interval, unit_tok) = match toks.as_slice() {
            [n, u] => (n.parse::<u32>().ok(), Some(*u)),
            [u] => (Some(1), Some(*u)),
            _ => (None, None),
        };
        if let (Some(interval), Some(u)) = (interval, unit_tok) {
            if let Some(unit) = unit_from_word(u) {
                return Recurrence {
                    interval,
                    unit,
                    mode,
                    raw: None,
                };
            }
        }
    }
    // Unmodeled rule: keep verbatim.
    Recurrence {
        interval: 1,
        unit: IntervalUnit::Days,
        mode,
        raw: Some(s.to_string()),
    }
}

fn unit_from_word(w: &str) -> Option<IntervalUnit> {
    match w.trim_end_matches('s') {
        "day" => Some(IntervalUnit::Days),
        "week" => Some(IntervalUnit::Weeks),
        "month" => Some(IntervalUnit::Months),
        "year" => Some(IntervalUnit::Years),
        _ => None,
    }
}

pub fn format_rule(r: &Recurrence) -> String {
    if let Some(raw) = &r.raw {
        return raw.clone();
    }
    let unit = match r.unit {
        IntervalUnit::Days => "day",
        IntervalUnit::Weeks => "week",
        IntervalUnit::Months => "month",
        IntervalUnit::Years => "year",
    };
    let base = if r.interval == 1 {
        format!("every {}", unit)
    } else {
        format!("every {} {}s", r.interval, unit)
    };
    match r.mode {
        RecurrenceMode::WhenDone => format!("{} when done", base),
        RecurrenceMode::Fixed => base,
    }
}

/// Next occurrence date from `from`, or None for raw (unmodeled) rules.
pub fn next_date(r: &Recurrence, from: NaiveDate) -> Option<NaiveDate> {
    if r.raw.is_some() {
        return None;
    }
    let i = r.interval as i64;
    Some(match r.unit {
        IntervalUnit::Days => from + chrono::Duration::days(i),
        IntervalUnit::Weeks => from + chrono::Duration::weeks(i),
        IntervalUnit::Months => from
            .checked_add_months(Months::new(r.interval))
            .unwrap_or(from),
        IntervalUnit::Years => from
            .checked_add_months(Months::new(r.interval * 12))
            .unwrap_or(from),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_interval() {
        let r = parse_rule("every 2 weeks");
        assert_eq!(
            r,
            Recurrence {
                interval: 2,
                unit: IntervalUnit::Weeks,
                mode: RecurrenceMode::Fixed,
                raw: None
            }
        );
    }

    #[test]
    fn parses_singular_unit_as_interval_one() {
        let r = parse_rule("every day");
        assert_eq!(
            r,
            Recurrence {
                interval: 1,
                unit: IntervalUnit::Days,
                mode: RecurrenceMode::Fixed,
                raw: None
            }
        );
    }

    #[test]
    fn parses_when_done_mode() {
        let r = parse_rule("every week when done");
        assert_eq!(
            r,
            Recurrence {
                interval: 1,
                unit: IntervalUnit::Weeks,
                mode: RecurrenceMode::WhenDone,
                raw: None
            }
        );
    }

    #[test]
    fn keeps_unmodeled_rule_raw() {
        let r = parse_rule("every weekday");
        assert_eq!(r.raw.as_deref(), Some("every weekday"));
    }

    #[test]
    fn formats_modeled_rules() {
        assert_eq!(format_rule(&parse_rule("every 2 weeks")), "every 2 weeks");
        assert_eq!(format_rule(&parse_rule("every day")), "every day");
        assert_eq!(
            format_rule(&parse_rule("every week when done")),
            "every week when done"
        );
    }

    #[test]
    fn formats_raw_rules_verbatim() {
        assert_eq!(format_rule(&parse_rule("every weekday")), "every weekday");
    }

    #[test]
    fn next_date_advances_modeled_rules() {
        let from = NaiveDate::from_ymd_opt(2026, 6, 16).unwrap();
        let r = parse_rule("every 2 weeks");
        assert_eq!(
            next_date(&r, from),
            Some(NaiveDate::from_ymd_opt(2026, 6, 30).unwrap())
        );
    }

    #[test]
    fn next_date_is_none_for_raw_rules() {
        let from = NaiveDate::from_ymd_opt(2026, 6, 16).unwrap();
        assert_eq!(next_date(&parse_rule("every weekday"), from), None);
    }
}
