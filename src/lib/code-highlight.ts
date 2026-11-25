export type CodeTokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number';

export type CodeToken = {
  kind: CodeTokenKind;
  text: string;
};

const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'def', 'defer', 'delete', 'do', 'elif', 'else', 'enum', 'export',
  'extends', 'false', 'finally', 'fn', 'for', 'from', 'func', 'function', 'go',
  'if', 'impl', 'import', 'in', 'interface', 'is', 'let', 'match', 'mut', 'new',
  'nil', 'none', 'None', 'not', 'null', 'or', 'package', 'private', 'pub', 'public',
  'raise', 'return', 'select', 'self', 'static', 'struct', 'super', 'switch',
  'throw', 'true', 'True', 'False', 'try', 'type', 'typeof', 'use', 'var', 'void',
  'where', 'while', 'with', 'yield',
]);

function pushToken(tokens: CodeToken[], kind: CodeTokenKind, text: string) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
  } else {
    tokens.push({ kind, text });
  }
}

export function highlightCodeLine(line: string, language?: string): CodeToken[] {
  if (!line) return [];
  const tokens: CodeToken[] = [];
  const lang = (language || '').toLowerCase();
  const hashComment = !lang || ['py', 'python', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'rb', 'ruby'].includes(lang);

  let i = 0;
  while (i < line.length) {
    const ch = line[i];

    // Line comments: // or #
    if ((ch === '/' && line[i + 1] === '/') || (hashComment && ch === '#')) {
      pushToken(tokens, 'comment', line.slice(i));
      break;
    }

    // Quoted strings: ', ", `
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\' && j + 1 < line.length) {
          j += 2;
          continue;
        }
        if (line[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      pushToken(tokens, 'string', line.slice(i, j));
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) && (i === 0 || !/[A-Za-z0-9_$]/.test(line[i - 1]))) {
      let j = i + 1;
      while (j < line.length && /[0-9a-fA-FxXoObB_.]/.test(line[j])) j += 1;
      pushToken(tokens, 'number', line.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_$]/.test(line[j])) j += 1;
      const word = line.slice(i, j);
      pushToken(tokens, KEYWORDS.has(word) ? 'keyword' : 'plain', word);
      i = j;
      continue;
    }

    pushToken(tokens, 'plain', ch);
    i += 1;
  }

  return tokens;
}
