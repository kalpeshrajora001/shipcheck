/**
 * Minimal glob matcher — supports **, *, ?, and path segments.
 * Avoids pulling in the minimatch dependency.
 */

export function minimatch(filePath: string, pattern: string): boolean {
  const pathNorm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const patNorm = pattern.replace(/\\/g, '/');
  const regex = globToRegExp(patNorm);
  return regex.test(pathNorm);
}

function globToRegExp(glob: string): RegExp {
  let i = 0;
  let out = '^';
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** or **/
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if ('+.^$()[]{}|'.includes(c)) {
      out += '\\' + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  out += '$';
  return new RegExp(out, 'i');
}
