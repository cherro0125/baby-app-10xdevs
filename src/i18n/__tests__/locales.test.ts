import en from '../locales/en';
import pl from '../locales/pl';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
}

const enFlat = flatten(en as unknown as Tree);
const plFlat = flatten(pl as unknown as Tree);

describe('locales', () => {
  it('have identical key sets', () => {
    expect(Object.keys(plFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('have no empty Polish values', () => {
    const empty = Object.entries(plFlat).filter(([, value]) => value.trim() === '');
    expect(empty).toEqual([]);
  });

  it('use the same interpolation placeholders per key', () => {
    const mismatched = Object.keys(enFlat).filter(
      (key) => placeholders(enFlat[key]).join() !== placeholders(plFlat[key] ?? '').join(),
    );
    expect(mismatched).toEqual([]);
  });
});
