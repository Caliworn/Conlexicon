(function initGlossModel(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ConlexiconGloss = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createGlossModel() {
  const GLOSS_LEVEL_KEYS = Object.freeze(["gla", "glb", "glc", "ft"]);
  // Longer names first, so \glft is not read as an unknown \gl... and \gla
  // wins over \a.
  const LEVEL_MARKERS = Object.freeze([
    ["glpreamble", "preamble"],
    ["glft", "ft"],
    ["gla", "gla"],
    ["glb", "glb"],
    ["glc", "glc"],
    ["ft", "ft"],
    ["a", "gla"],
    ["b", "glb"],
    ["c", "glc"],
  ]);
  // \b o and \c c are LaTeX accents, so the one-letter aliases only count
  // where a level can start: at the start of a line or after a //.
  const SHORT_LEVEL_ALIASES = Object.freeze(["a", "b", "c"]);
  const INLINE_STYLE_COMMANDS = Object.freeze({
    textbf: "bold",
    textit: "italic",
    textsc: "smallCaps",
    textnormal: "normal",
  });
  const GROUP_SMALL_CAPS_COMMANDS = Object.freeze(["scshape", "sc"]);
  const ESCAPED_CHARACTERS = "%&#_${}";

  // Older data stored line breaks as a literal backslash-n; JSON import turns
  // them into real line breaks. A backslash-n followed by a letter is a command
  // such as \nogloss and stays as written.
  function normalizeGlossLineBreaks(value) {
    return String(value || "").replace(/\\n(?![A-Za-z])/g, "\n");
  }

  function readLevelMarker(line, position, allowShortAliases) {
    if (line[position] !== "\\") {
      return null;
    }
    for (const [name, key] of LEVEL_MARKERS) {
      if (!allowShortAliases && SHORT_LEVEL_ALIASES.includes(name)) {
        continue;
      }
      const end = position + 1 + name.length;
      if (line.startsWith(name, position + 1) && (end === line.length || /\s/.test(line[end]))) {
        return { key, end };
      }
    }
    return null;
  }

  // \ex and \begingl may carry [options]; \ex may also carry a <tag>.
  function readWrapper(line, position) {
    const match = /^\\(ex|begingl|endgl|xe)(?![A-Za-z])/.exec(line.slice(position));
    if (!match) {
      return null;
    }
    let end = position + match[0].length;
    if (match[1] === "ex" || match[1] === "begingl") {
      const options = /^\s*\[[^\]]*\]/.exec(line.slice(end));
      end += options ? options[0].length : 0;
    }
    if (match[1] === "ex") {
      const tag = /^\s*<[^<>]*>/.exec(line.slice(end));
      end += tag ? tag[0].length : 0;
    }
    return { end };
  }

  function skipSpaces(line, position) {
    let index = position;
    while (index < line.length && /\s/.test(line[index])) {
      index += 1;
    }
    return index;
  }

  // Reads text up to the next boundary on the line: a // that closes the
  // level, a full level marker or wrapper after a space, or the line end.
  // A // closes only before the line end, a marker or a wrapper, and never
  // inside braces, so //kat// mid-line stays text.
  function scanSegment(line, start) {
    let depth = 0;
    for (let index = start; index < line.length; index += 1) {
      const char = line[index];
      if (char === "\\") {
        if (depth === 0 && index > start && /\s/.test(line[index - 1])
          && (readLevelMarker(line, index, false) || readWrapper(line, index))) {
          return { contentEnd: index, next: index, closed: false };
        }
        index += 1;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0 && char === "/" && line[index + 1] === "/") {
        const next = skipSpaces(line, index + 2);
        if (next === line.length || readLevelMarker(line, next, true) || readWrapper(line, next)) {
          return { contentEnd: index, next, closed: true };
        }
      }
    }
    return { contentEnd: line.length, next: line.length, closed: false };
  }

  // Block commands such as \pex or \lingset start a line or segment; inline
  // styles do not.
  function unknownBlockCommand(text) {
    const match = /^\\([A-Za-z]+)/.exec(text);
    return match && !Object.hasOwn(INLINE_STYLE_COMMANDS, match[1]) ? match[0] : "";
  }

  // Exceptional \gla items, as in ExPex: + starts a new line, @ joins the
  // next item to the previous one, and an item starting with \nogloss has
  // nothing below it. Lower levels align with the remaining items.
  function readGlaItems(tokens) {
    const items = [];
    const layout = { breaks: [], joins: [], nogloss: [] };
    let pending = "";
    tokens.forEach((token) => {
      if (token === "+" || token === "@") {
        if (items.length && pending !== "+") {
          pending = token;
        }
        return;
      }
      let text = token;
      const nogloss = /^\\nogloss(?![A-Za-z])\s*/.exec(token);
      if (nogloss) {
        const rest = token.slice(nogloss[0].length);
        const close = rest.startsWith("{") ? findGroupEnd(rest, 0) : -1;
        text = close === -1 ? rest : rest.slice(1, close) + rest.slice(close + 1);
        layout.nogloss.push(items.length);
      }
      if (pending === "+") {
        layout.breaks.push(items.length);
      } else if (pending === "@") {
        layout.joins.push(items.length);
      }
      pending = "";
      items.push(text);
    });
    return { items, layout };
  }

  // Reads a gloss source text the way ExPex does. A level runs from its
  // marker to the closing //, the next marker or a wrapper, across lines, so
  // a long \gla may wrap. Text before the first level is the preamble, like
  // \glpreamble. Lines starting with %, the ExPex wrappers and block commands
  // outside a level are skipped; the commands are kept in notices. Text after
  // a closed level and a repeated level are issues, so the caller can show the
  // source instead of losing part of it. Content without levels is plain text,
  // line by line.
  function parseGloss(value) {
    const levels = {};
    const leading = [];
    const comments = [];
    const issues = [];
    const notices = [];
    let current = null;
    let closed = false;
    const append = (text) => {
      const trimmed = text.trim();
      if (current && !current.discard && trimmed) {
        levels[current.key].push(trimmed);
      }
    };
    String(value || "").split(/\r?\n/).forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }
      if (line.startsWith("%")) {
        comments.push(line.slice(1).trim());
        return;
      }
      const lineNumber = lineIndex + 1;
      let position = 0;
      let segmentStart = true;
      while (position < line.length) {
        position = skipSpaces(line, position);
        if (position >= line.length) {
          break;
        }
        const wrapper = readWrapper(line, position);
        if (wrapper) {
          if (current) {
            current = null;
            closed = true;
          }
          position = wrapper.end;
          segmentStart = true;
          continue;
        }
        const marker = readLevelMarker(line, position, segmentStart);
        if (marker) {
          if (Object.hasOwn(levels, marker.key)) {
            issues.push({ code: "duplicate_level", line: lineNumber, level: marker.key });
            current = { key: marker.key, discard: true };
          } else {
            levels[marker.key] = [];
            current = { key: marker.key, discard: false };
          }
          position = marker.end;
          segmentStart = false;
          continue;
        }
        const segment = scanSegment(line, position);
        const text = line.slice(position, segment.contentEnd).trim();
        if (current) {
          append(text);
        } else if (closed) {
          const command = unknownBlockCommand(text);
          const last = issues[issues.length - 1];
          if (command) {
            notices.push({ code: "unknown_command", line: lineNumber, command });
          } else if (text && !(last?.code === "stray_line" && last.line === lineNumber)) {
            issues.push({ code: "stray_line", line: lineNumber });
          }
        } else if (text) {
          leading.push({ line: lineNumber, text, command: unknownBlockCommand(text) });
        }
        if (segment.closed) {
          current = null;
          closed = true;
        }
        position = segment.next;
        segmentStart = segment.closed;
      }
    });
    const hasLevels = Object.keys(levels).length > 0;
    if (!hasLevels) {
      const plainLines = [];
      leading.forEach(({ line, text }, index) => {
        if (index > 0 && leading[index - 1].line === line) {
          plainLines[plainLines.length - 1] += ` ${text}`;
        } else {
          plainLines.push(text);
        }
      });
      return {
        kind: plainLines.length ? "plain" : "empty",
        gloss: emptyGloss(),
        plainLines,
        comments,
        issues,
        notices,
      };
    }
    const preambleText = leading.filter(({ command }) => !command).map(({ text }) => text);
    leading.filter(({ command }) => command).forEach(({ line, command }) => {
      notices.push({ code: "unknown_command", line, command });
    });
    if (preambleText.length) {
      if (Object.hasOwn(levels, "preamble")) {
        issues.push({ code: "duplicate_level", line: leading.find(({ command }) => !command).line, level: "preamble" });
      } else {
        levels.preamble = preambleText;
      }
    }
    notices.sort((left, right) => left.line - right.line);
    const levelText = (key) => (levels[key] || []).join(" ");
    const gla = readGlaItems(tokenizeGlossLevel(levelText("gla")));
    return {
      kind: "gloss",
      gloss: {
        preamble: levelText("preamble"),
        gla: gla.items,
        glaLayout: gla.layout,
        glb: tokenizeGlossLevel(levelText("glb")),
        glc: tokenizeGlossLevel(levelText("glc")),
        ft: levelText("ft"),
      },
      plainLines: [],
      comments,
      issues,
      notices,
    };
  }

  function emptyGloss() {
    return { preamble: "", gla: [], glaLayout: { breaks: [], joins: [], nogloss: [] }, glb: [], glc: [], ft: "" };
  }

  // Splits a level into aligned items. Only spaces outside braces separate
  // items, so {out to throw} and \textsc{3 acc} stay one item each.
  function tokenizeGlossLevel(value) {
    const tokens = [];
    let depth = 0;
    let current = "";
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "\\" && index + 1 < text.length) {
        current += char + text[index + 1];
        index += 1;
        continue;
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
      }
      if (depth === 0 && /\s/.test(char)) {
        if (current) {
          tokens.push(current);
        }
        current = "";
      } else {
        current += char;
      }
    }
    if (current) {
      tokens.push(current);
    }
    return tokens;
  }

  function findGroupEnd(text, open) {
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
      const char = text[index];
      if (char === "\\") {
        index += 1;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }
    return -1;
  }

  function pushText(nodes, value) {
    if (!value) {
      return;
    }
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") {
      last.value += value;
    } else {
      nodes.push({ type: "text", value });
    }
  }

  // Reads the inline formatting of one item or line. \textbf, \textit,
  // \textsc, \textnormal and {\sc ...} become style nodes, plain braces
  // group without showing, and other commands stay as written text.
  function parseGlossInline(value) {
    const text = String(value || "");
    const nodes = [];
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === "\\") {
        const command = /^\\([A-Za-z]+)/.exec(text.slice(index));
        if (!command) {
          const next = text[index + 1] || "";
          pushText(nodes, ESCAPED_CHARACTERS.includes(next) && next ? next : char + next);
          index += 1 + next.length;
          continue;
        }
        const commandEnd = index + command[0].length;
        const style = INLINE_STYLE_COMMANDS[command[1]];
        if (style && text[commandEnd] === "{") {
          const close = findGroupEnd(text, commandEnd);
          if (close !== -1) {
            nodes.push({ type: "style", style, children: parseGlossInline(text.slice(commandEnd + 1, close)) });
            index = close + 1;
            continue;
          }
        }
        let literalEnd = commandEnd;
        while (text[literalEnd] === "{") {
          const close = findGroupEnd(text, literalEnd);
          if (close === -1) {
            break;
          }
          literalEnd = close + 1;
        }
        pushText(nodes, text.slice(index, literalEnd));
        index = literalEnd;
        continue;
      }
      if (char === "{") {
        const close = findGroupEnd(text, index);
        if (close === -1) {
          pushText(nodes, char);
          index += 1;
          continue;
        }
        const inner = text.slice(index + 1, close);
        const smallCaps = GROUP_SMALL_CAPS_COMMANDS
          .map((name) => new RegExp(`^\\\\${name}(?![A-Za-z])\\s*`).exec(inner))
          .find(Boolean);
        if (smallCaps) {
          nodes.push({ type: "style", style: "smallCaps", children: parseGlossInline(inner.slice(smallCaps[0].length)) });
        } else {
          parseGlossInline(inner).forEach((node) => (
            node.type === "text" ? pushText(nodes, node.value) : nodes.push(node)
          ));
        }
        index = close + 1;
        continue;
      }
      pushText(nodes, char);
      index += 1;
    }
    return nodes;
  }

  function glossInlinePlainText(value) {
    const flatten = (nodes) => nodes
      .map((node) => (node.type === "text" ? node.value : flatten(node.children)))
      .join("");
    return flatten(parseGlossInline(value));
  }

  // The text a search should see: the preamble, every level, plain line and
  // comment with the inline formatting removed, so the-acc matches
  // the-\textsc{acc}.
  function glossSearchText(value) {
    const parsed = parseGloss(value);
    return [
      parsed.gloss.preamble,
      ...GLOSS_LEVEL_KEYS.map((key) => (key === "ft" ? parsed.gloss.ft : parsed.gloss[key].join(" "))),
      ...parsed.plainLines,
      ...parsed.comments,
    ]
      .filter(Boolean)
      .map(glossInlinePlainText)
      .join("\n");
  }

  return {
    GLOSS_LEVEL_KEYS,
    glossInlinePlainText,
    glossSearchText,
    normalizeGlossLineBreaks,
    parseGloss,
    parseGlossInline,
    tokenizeGlossLevel,
  };
});
