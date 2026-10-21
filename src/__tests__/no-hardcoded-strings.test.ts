// Node types are scoped to this file; app code must not see Node globals.
/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC_DIR = path.resolve(__dirname, '..');

// Brand name, code-format placeholder and self-named languages are intentionally literal.
const ALLOWLIST = new Set(['BabyTrack', 'ABCD1234', 'English', 'Polski']);

const TEXT_PROPS = new Set(['placeholder', 'label', 'title', 'accessibilityLabel', 'accessibilityHint']);

const HAS_LETTER = /\p{L}/u;

function listTsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listTsxFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

// Operators whose string operands can end up rendered; comparisons (===, !==, …) are skipped.
const RENDERING_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.PlusToken,
]);

// String literals reachable from a JSX expression without passing through a function call,
// e.g. {'text'}, {cond ? 'a' : 'b'}, {x ?? 'text'}.
function literalsIn(expr: ts.Expression): ts.StringLiteralLike[] {
  if (ts.isStringLiteralLike(expr)) return [expr];
  if (ts.isParenthesizedExpression(expr)) return literalsIn(expr.expression);
  if (ts.isConditionalExpression(expr)) return [...literalsIn(expr.whenTrue), ...literalsIn(expr.whenFalse)];
  if (ts.isBinaryExpression(expr) && RENDERING_OPERATORS.has(expr.operatorToken.kind)) {
    return [...literalsIn(expr.left), ...literalsIn(expr.right)];
  }
  return [];
}

function isOffending(text: string): boolean {
  const trimmed = text.trim();
  return HAS_LETTER.test(trimmed) && !ALLOWLIST.has(trimmed);
}

// Heuristic, not full coverage. It does NOT catch literals that reach the UI outside JSX:
// lookup maps (`LABELS[status]`), state setters (`setError('…')`), `Alert.alert`, template
// literals with substitutions, helper return values, or anything in `.ts` files. Keep those
// going through `t()` by review (see the i18n rule in context/foundation/lessons.md).
export function findHardcodedStrings(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];

  function report(node: ts.Node, text: string) {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    hits.push(`${fileName}:${line + 1} ${JSON.stringify(text.trim())}`);
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && isOffending(node.text)) {
      report(node, node.text);
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      for (const lit of literalsIn(node.expression)) if (isOffending(lit.text)) report(lit, lit.text);
    } else if (ts.isJsxAttribute(node) && TEXT_PROPS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      const literals = ts.isStringLiteral(init)
        ? [init]
        : ts.isJsxExpression(init) && init.expression
          ? literalsIn(init.expression)
          : [];
      for (const lit of literals) if (isOffending(lit.text)) report(lit, lit.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return hits;
}

describe('hardcoded-string guard', () => {
  it('detects literal text, string props and literal JSX expressions', () => {
    const hits = findHardcodedStrings(
      'fixture.tsx',
      [
        '<View>',
        '  <Text>Hello</Text>',
        '  <TextInput placeholder="Type here" />',
        "  <Text>{busy ? 'Saving…' : t('save')}</Text>",
        '  <Text>BabyTrack</Text>',
        "  <Text>{t('ok')} · …</Text>",
        "  {status === 'alert' && <Text>{t('alert')}</Text>}",
        '</View>',
      ].join('\n'),
    );

    expect(hits).toEqual([
      'fixture.tsx:2 "Hello"',
      'fixture.tsx:3 "Type here"',
      'fixture.tsx:4 "Saving…"',
    ]);
  });

  it('finds no user-visible literals in src', () => {
    const hits = listTsxFiles(SRC_DIR).flatMap((file) =>
      findHardcodedStrings(path.relative(SRC_DIR, file), fs.readFileSync(file, 'utf8')),
    );

    expect(hits).toEqual([]);
  });
});
