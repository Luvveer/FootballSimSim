/** Iterates RFC 4180 rows without retaining a second copy of the entire CSV in memory. */
export function* iterateCsv(input: string): Generator<string[]> {
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      yield row;
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("Invalid CSV: unclosed quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** Convenience helper for small callers and focused parser tests. */
export function parseCsv(input: string): string[][] {
  return [...iterateCsv(input)];
}
