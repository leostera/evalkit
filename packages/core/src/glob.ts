/**
 * A glob matcher for discovery: `*` and `?` stay within a path segment, `**`
 * spans segments, and `{a,b}` is an alternation.
 */
export function globMatcher(pattern: string): (path: string) => boolean {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '*' && pattern[index + 1] === '*') {
      index++;
      if (pattern[index + 1] === '/') {
        index++;
        source += '(?:.*/)?';
      } else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else if (char === '{') {
      const end = pattern.indexOf('}', index);
      if (end === -1) source += '\\{';
      else {
        source += `(?:${pattern
          .slice(index + 1, end)
          .split(',')
          .map((part) =>
            part.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
          )
          .join('|')})`;
        index = end;
      }
    } else source += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const expression = new RegExp(`^${source}$`);
  return (path) => expression.test(path);
}
