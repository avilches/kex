//! Edits a JSON document by text: only the values that changed are rewritten, so a diff of
//! the file shows what was added or removed and nothing else. Indentation, spacing around
//! `:` and `,`, `\/` escapes and key order of untouched parts come back byte for byte.
//! New entries copy the layout of their neighbours.

use serde_json::Value;

type Span = (usize, usize);

enum Node {
    Scalar(Span),
    Array(Span, Vec<Item>, Span),
    Object(Span, Vec<Member>, Span),
}

struct Item {
    lead: Span,
    node: Node,
}

struct Member {
    lead: Span,
    key: Span,
    colon: Span,
    node: Node,
}

impl Node {
    fn span(&self) -> Span {
        match self {
            Node::Scalar(s) | Node::Array(s, ..) | Node::Object(s, ..) => *s,
        }
    }
}

struct Scanner<'a> {
    src: &'a str,
    bytes: &'a [u8],
}

impl Scanner<'_> {
    fn ws(&self, mut i: usize) -> usize {
        while i < self.bytes.len() && self.bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        i
    }

    fn string_end(&self, start: usize) -> Option<usize> {
        let mut i = start + 1;
        while i < self.bytes.len() {
            match self.bytes[i] {
                b'\\' => i += 2,
                b'"' => return Some(i + 1),
                _ => i += 1,
            }
        }
        None
    }

    fn node(&self, start: usize) -> Option<Node> {
        match *self.bytes.get(start)? {
            b'[' => self.container(start, b']'),
            b'{' => self.container(start, b'}'),
            b'"' => Some(Node::Scalar((start, self.string_end(start)?))),
            _ => {
                let mut i = start;
                while i < self.bytes.len()
                    && !matches!(self.bytes[i], b',' | b']' | b'}')
                    && !self.bytes[i].is_ascii_whitespace()
                {
                    i += 1;
                }
                (i > start).then_some(Node::Scalar((start, i)))
            }
        }
    }

    fn container(&self, start: usize, close: u8) -> Option<Node> {
        let is_object = close == b'}';
        let mut items = Vec::new();
        let mut members = Vec::new();
        let mut i = start + 1;
        loop {
            let value_lead = (i, self.ws(i));
            i = value_lead.1;
            if *self.bytes.get(i)? == close {
                let trail = (value_lead.0, i);
                let span = (start, i + 1);
                return Some(if is_object {
                    Node::Object(span, members, trail)
                } else {
                    Node::Array(span, items, trail)
                });
            }
            if is_object {
                let key = (i, self.string_end(i)?);
                let colon_end = self.ws(key.1);
                if *self.bytes.get(colon_end)? != b':' {
                    return None;
                }
                let value_start = self.ws(colon_end + 1);
                let node = self.node(value_start)?;
                i = node.span().1;
                members.push(Member {
                    lead: value_lead,
                    key,
                    colon: (key.1, value_start),
                    node,
                });
            } else {
                let node = self.node(i)?;
                i = node.span().1;
                items.push(Item {
                    lead: value_lead,
                    node,
                });
            }
            let value_end = i;
            i = self.ws(i);
            match *self.bytes.get(i)? {
                b',' => i += 1,
                c if c == close => i = value_end,
                _ => return None,
            }
        }
    }
}

/// `next` rendered over `original`: untouched parts keep their bytes. A document that does not
/// scan, or an edit that would not read back as `next`, falls back to a fresh rendering.
pub fn patch(original: &str, next: &Value) -> String {
    let unit = indent_unit(original);
    if let Some(text) = patch_text(original, next, &unit) {
        if serde_json::from_str::<Value>(&text).is_ok_and(|v| v == *next) {
            return text;
        }
    }
    let mut out = render(next, "", &unit);
    if original.is_empty() || original.ends_with('\n') {
        out.push('\n');
    }
    out
}

fn patch_text(original: &str, next: &Value, unit: &str) -> Option<String> {
    let scanner = Scanner {
        src: original,
        bytes: original.as_bytes(),
    };
    let start = scanner.ws(0);
    let root = scanner.node(start)?;
    let (s, e) = root.span();
    if !original[e..].trim().is_empty() {
        return None;
    }
    let body = patch_node(&scanner, &root, next, "", unit);
    Some(format!("{}{body}{}", &original[..s], &original[e..]))
}

fn indent_unit(text: &str) -> String {
    text.lines()
        .skip(1)
        .find(|l| l.starts_with([' ', '\t']))
        .map(|l| {
            l.chars()
                .take_while(|c| *c == ' ' || *c == '\t')
                .collect::<String>()
        })
        .unwrap_or_else(|| "  ".to_string())
}

fn value_of(sc: &Scanner, span: Span) -> Option<Value> {
    serde_json::from_str(&sc.src[span.0..span.1]).ok()
}

fn text<'a>(sc: &Scanner<'a>, span: Span) -> &'a str {
    &sc.src[span.0..span.1]
}

fn child_base(lead: &str, base: &str) -> String {
    match lead.rfind('\n') {
        Some(i) => lead[i + 1..].to_string(),
        None => base.to_string(),
    }
}

fn patch_node(sc: &Scanner, node: &Node, next: &Value, base: &str, unit: &str) -> String {
    let span = node.span();
    if value_of(sc, span).is_some_and(|v| v == *next) {
        return text(sc, span).to_string();
    }
    match (node, next) {
        (Node::Array(_, items, trail), Value::Array(new_items)) => {
            if new_items.is_empty() {
                return "[]".to_string();
            }
            let default_lead = format!("\n{base}{unit}");
            let mut used = vec![false; items.len()];
            let mut parts: Vec<(String, String)> = Vec::new();
            for (ni, nv) in new_items.iter().enumerate() {
                let exact = (0..items.len())
                    .find(|&j| !used[j] && value_of(sc, items[j].node.span()).as_ref() == Some(nv));
                let positional =
                    (ni < items.len() && !used[ni] && same_kind(&items[ni].node, nv)).then_some(ni);
                let neighbour = || {
                    parts
                        .last()
                        .map(|p| p.0.clone())
                        .or_else(|| items.first().map(|i| text(sc, i.lead).to_string()))
                        .unwrap_or_else(|| default_lead.clone())
                };
                let (lead, body) = if let Some(j) = exact {
                    used[j] = true;
                    (
                        text(sc, items[j].lead).to_string(),
                        text(sc, items[j].node.span()).to_string(),
                    )
                } else if let Some(j) = positional {
                    used[j] = true;
                    let lead = text(sc, items[j].lead).to_string();
                    let b = child_base(&lead, base);
                    let body = patch_node(sc, &items[j].node, nv, &b, unit);
                    (lead, body)
                } else {
                    let lead = neighbour();
                    let b = child_base(&lead, base);
                    (lead, render(nv, &b, unit))
                };
                parts.push((lead, body));
            }
            let trail_text = if items.is_empty() {
                format!("\n{base}")
            } else {
                text(sc, *trail).to_string()
            };
            let inner = parts
                .iter()
                .map(|(l, b)| format!("{l}{b}"))
                .collect::<Vec<_>>()
                .join(",");
            format!("[{inner}{trail_text}]")
        }
        (Node::Object(_, members, trail), Value::Object(new_map)) => {
            if new_map.is_empty() {
                return "{}".to_string();
            }
            let default_lead = format!("\n{base}{unit}");
            let keys: Vec<Option<String>> = members
                .iter()
                .map(|m| match value_of(sc, m.key) {
                    Some(Value::String(s)) => Some(s),
                    _ => None,
                })
                .collect();
            let mut parts: Vec<String> = Vec::new();
            let mut last_lead: Option<String> = None;
            for (k, nv) in new_map {
                let found = keys.iter().position(|x| x.as_deref() == Some(k.as_str()));
                let piece = if let Some(j) = found {
                    let m = &members[j];
                    let lead = text(sc, m.lead).to_string();
                    let b = child_base(&lead, base);
                    let body = patch_node(sc, &m.node, nv, &b, unit);
                    last_lead = Some(lead.clone());
                    format!("{lead}{}{}{body}", text(sc, m.key), text(sc, m.colon))
                } else {
                    let lead = last_lead
                        .clone()
                        .or_else(|| members.first().map(|m| text(sc, m.lead).to_string()))
                        .unwrap_or_else(|| default_lead.clone());
                    let colon = members
                        .first()
                        .map(|m| text(sc, m.colon).to_string())
                        .unwrap_or_else(|| ": ".to_string());
                    let b = child_base(&lead, base);
                    let key = serde_json::to_string(k).unwrap_or_default();
                    last_lead = Some(lead.clone());
                    format!("{lead}{key}{colon}{}", render(nv, &b, unit))
                };
                parts.push(piece);
            }
            let trail_text = if members.is_empty() {
                format!("\n{base}")
            } else {
                text(sc, *trail).to_string()
            };
            format!("{{{}{trail_text}}}", parts.join(","))
        }
        _ => render(next, base, unit),
    }
}

fn same_kind(node: &Node, value: &Value) -> bool {
    matches!(
        (node, value),
        (Node::Array(..), Value::Array(_)) | (Node::Object(..), Value::Object(_))
    )
}

fn render(value: &Value, base: &str, unit: &str) -> String {
    let inner = format!("{base}{unit}");
    match value {
        Value::Array(items) if !items.is_empty() => {
            let body = items
                .iter()
                .map(|v| format!("\n{inner}{}", render(v, &inner, unit)))
                .collect::<Vec<_>>()
                .join(",");
            format!("[{body}\n{base}]")
        }
        Value::Object(map) if !map.is_empty() => {
            let body = map
                .iter()
                .map(|(k, v)| {
                    let key = serde_json::to_string(k).unwrap_or_default();
                    format!("\n{inner}{key}: {}", render(v, &inner, unit))
                })
                .collect::<Vec<_>>()
                .join(",");
            format!("{{{body}\n{base}}}")
        }
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn unchanged_value_comes_back_identical() {
        let src = "{\n\t\"a\" : [1,2],\n\t\"b\":\"x\\/y\"\n}\n";
        assert_eq!(patch(src, &parse(src)), src);
    }

    #[test]
    fn a_new_key_touches_only_its_own_lines() {
        let src = "{\n    \"a\" : \"x\\/y\",\n    \"b\": [1,   2]\n}\n";
        let mut v = parse(src);
        v["c"] = json!(true);
        assert_eq!(
            patch(src, &v),
            "{\n    \"a\" : \"x\\/y\",\n    \"b\": [1,   2],\n    \"c\" : true\n}\n"
        );
    }

    #[test]
    fn a_nested_change_leaves_the_siblings_alone() {
        let src = "{\n \"hooks\":{\n  \"Stop\" :[ {\"k\":1} ],\n  \"Other\": [\n   \"z\"\n  ]\n },\n \"x\":  1\n}";
        let mut v = parse(src);
        v["hooks"]["Stop"]
            .as_array_mut()
            .unwrap()
            .push(json!({"k": 2}));
        let out = patch(src, &v);
        assert!(out.contains("\"Other\": [\n   \"z\"\n  ]\n },\n \"x\":  1\n}"));
        assert_eq!(parse(&out), v);
    }

    #[test]
    fn removing_an_entry_removes_only_that_entry() {
        let src = "{\n  \"a\": 1,\n  \"b\": {\n    \"c\": 2\n  },\n  \"d\": 3\n}\n";
        let mut v = parse(src);
        v.as_object_mut().unwrap().remove("b");
        assert_eq!(patch(src, &v), "{\n  \"a\": 1,\n  \"d\": 3\n}\n");
    }

    #[test]
    fn a_new_container_is_laid_out_with_the_files_indent() {
        let src = "{\n\t\"a\": 1\n}\n";
        let mut v = parse(src);
        v["hooks"] = json!({"Stop": [{"hooks": [{"type": "command"}]}]});
        let out = patch(src, &v);
        assert!(out.contains("\n\t\"hooks\": {\n\t\t\"Stop\": [\n\t\t\t{"));
        assert_eq!(parse(&out), v);
    }

    #[test]
    fn an_empty_container_gets_filled_on_its_own_lines() {
        let src = "{\n  \"hooks\": {}\n}\n";
        let mut v = parse(src);
        v["hooks"]["Stop"] = json!([1]);
        let out = patch(src, &v);
        assert_eq!(
            out,
            "{\n  \"hooks\": {\n    \"Stop\": [\n      1\n    ]\n  }\n}\n"
        );
    }

    #[test]
    fn empty_and_unscannable_input_get_a_fresh_rendering() {
        let v = json!({"a": [1]});
        assert_eq!(patch("", &v), "{\n  \"a\": [\n    1\n  ]\n}\n");
        assert_eq!(parse(&patch("{ nope", &v)), v);
    }

    #[test]
    fn the_text_around_the_root_is_kept() {
        let src = "  {\"a\":1}  \n";
        let mut v = parse(src);
        v["b"] = json!(2);
        let out = patch(src, &v);
        assert!(out.starts_with("  {") && out.ends_with("}  \n"));
        assert_eq!(parse(&out), v);
    }
}
