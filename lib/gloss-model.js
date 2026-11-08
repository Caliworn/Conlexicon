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
    ["glft", "ft"],
    ["gla", "gla"],
    ["glb", "glb"],
    ["glc", "glc"],
    ["ft", "ft"],
    ["a", "gla"],
    ["b", "glb"],
    ["c", "glc"],
  ]);
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

  function readLevelMarker(line, position) {
    if (line[position] !== "\\") {
      return null;
    }
    for (const [name, key] of LEVEL_MARKERS) {
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

  // A // ends a level only before the end of the line or before the next
  // level marker or wrapper, and never inside braces, so //kat// mid-line
  // stays text.
  function findLevelEnd(line, start) {
    let depth = 0;
    for (let index = start; index < line.length; index += 1) {
      const char = line[index];
      if (char === "\\") {
        index += 1;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0 && char === "/" && line[index + 1] === "/") {
        const next = skipSpaces(line, index + 2);
        if (next === line.length || readLevelMarker(line, next) || readWrapper(line, next)) {
          return { contentEnd: index, next };
        }
      }
    }
    return { contentEnd: line.length, next: line.length };
  }

  function stripTrailingWrappers(text) {
    let result = text;
    let previous;
    do {
      previous = result;
      result = result.replace(/\s*\\(?:endgl|xe)\s*$/, "");
    } while (result !== previous);
    return result;
  }

  // Block commands such as \pex or \glpreamble take no braced argument; a
  // command with one, like \c{c}, is inline text.
  function lineStartsWithUnknownCommand(text) {
    const match = /^\\([A-Za-z]+)(?!\{)/.exec(text);
    return Boolean(match) && !Object.hasOwn(INLINE_STYLE_COMMANDS, match[1]);
  }

  // Reads a gloss source text. Levels and their aliases are recognized, the
  // ExPex wrappers are skipped, and lines starting with % are comments. Text
  // that cannot be read as gloss or plain text is reported in issues, so the
  // caller can show the source instead of losing part of it.
  function parseGloss(value) {
    const levels = {};
    const plainLines = [];
    const comments = [];
    const issues = [];
    String(value || "").split(/\r?\n/).forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }
      if (line.startsWith("%")) {
        comments.push(line.slice(1).trim());
        return;
      }
      let position = 0;
      while (position < line.length) {
        position = skipSpaces(line, position);
        if (position >= line.length) {
          break;
        }
        const wrapper = readWrapper(line, position);
        if (wrapper) {
          position = wrapper.end;
          continue;
        }
        const marker = readLevelMarker(line, position);
        if (marker) {
          const { contentEnd, next } = findLevelEnd(line, marker.end);
          const content = line.slice(marker.end, contentEnd).trim();
          if (Object.hasOwn(levels, marker.key)) {
            issues.push({ code: "duplicate_level", line: lineIndex + 1, level: marker.key });
          } else {
            levels[marker.key] = content;
          }
          position = next;
          continue;
        }
        const text = stripTrailingWrappers(line.slice(position));
        if (position === 0 && lineStartsWithUnknownCommand(text)) {
          issues.push({ code: "unknown_command", line: lineIndex + 1, command: /^\\[A-Za-z]+/.exec(text)[0] });
        }
        if (text) {
          plainLines.push(text);
        }
        break;
      }
    });
    const hasLevels = Object.keys(levels).length > 0;
    if (hasLevels && plainLines.length) {
      issues.push({ code: "stray_line" });
    }
    return {
      kind: hasLevels ? "gloss" : plainLines.length ? "plain" : "empty",
      gloss: {
        gla: tokenizeGlossLevel(levels.gla),
        glb: tokenizeGlossLevel(levels.glb),
        glc: tokenizeGlossLevel(levels.glc),
        ft: levels.ft || "",
      },
      plainLines,
      comments,
      issues,
    };
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

  // The text a search should see: every level, plain line and comment with
  // the inline formatting removed, so the-acc matches the-\textsc{acc}.
  function glossSearchText(value) {
    const parsed = parseGloss(value);
    return [
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
