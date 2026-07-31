export type ParamValue =
  | string
  | number
  | boolean
  | null
  | ParamValue[]
  | { [key: string]: ParamValue };

const ACTION_CONTROLLER_PARAMS_PREFIX = '#<ActionController::Parameters';

class RubyInspectParser {
  private readonly source: string;
  private position = 0;

  constructor(source: string) {
    this.source = source;
  }

  parse(): ParamValue {
    const value = this.parseValue();
    this.skipWhitespace();

    if (this.position !== this.source.length) {
      throw new Error(`Conteúdo inesperado na posição ${this.position}`);
    }

    return value;
  }

  private peek(): string | undefined {
    return this.source[this.position];
  }

  private atEnd(): boolean {
    return this.position >= this.source.length;
  }

  private skipWhitespace(): void {
    while (!this.atEnd() && /\s/.test(this.peek() as string)) this.position += 1;
  }

  private consume(char: string): void {
    if (this.peek() !== char) {
      throw new Error(`Esperava "${char}" na posição ${this.position}`);
    }

    this.position += 1;
  }

  private parseValue(): ParamValue {
    this.skipWhitespace();
    const char = this.peek();

    if (char === '{') return this.parseHash();
    if (char === '[') return this.parseArray();
    if (char === '"') return this.parseString();
    if (this.source.startsWith(ACTION_CONTROLLER_PARAMS_PREFIX, this.position)) {
      return this.parseActionControllerParameters();
    }

    if (this.source.startsWith('true', this.position)) {
      this.position += 4;
      return true;
    }

    if (this.source.startsWith('false', this.position)) {
      this.position += 5;
      return false;
    }

    if (this.source.startsWith('nil', this.position)) {
      this.position += 3;
      return null;
    }

    if (char === ':') return this.parseSymbol();
    if (char !== undefined && /[-\d]/.test(char)) return this.parseNumber();

    throw new Error(`Caractere inesperado "${char}" na posição ${this.position}`);
  }

  private parseHash(): Record<string, ParamValue> {
    this.consume('{');
    const result: Record<string, ParamValue> = {};
    this.skipWhitespace();

    if (this.peek() === '}') {
      this.position += 1;
      return result;
    }

    for (;;) {
      this.skipWhitespace();
      const key = this.peek() === ':' ? this.parseSymbol() : this.parseString();
      this.skipWhitespace();

      if (this.source.startsWith('=>', this.position)) {
        this.position += 2;
      } else if (this.peek() === ':') {
        this.position += 1;
      } else {
        throw new Error(`Esperava "=>" na posição ${this.position}`);
      }

      result[key] = this.parseValue();
      this.skipWhitespace();

      if (this.peek() === ',') {
        this.position += 1;
        continue;
      }

      if (this.peek() === '}') {
        this.position += 1;
        break;
      }

      throw new Error(`Esperava "," ou "}" na posição ${this.position}`);
    }

    return result;
  }

  private parseArray(): ParamValue[] {
    this.consume('[');
    const result: ParamValue[] = [];
    this.skipWhitespace();

    if (this.peek() === ']') {
      this.position += 1;
      return result;
    }

    for (;;) {
      result.push(this.parseValue());
      this.skipWhitespace();

      if (this.peek() === ',') {
        this.position += 1;
        continue;
      }

      if (this.peek() === ']') {
        this.position += 1;
        break;
      }

      throw new Error(`Esperava "," ou "]" na posição ${this.position}`);
    }

    return result;
  }

  private parseString(): string {
    this.consume('"');
    let result = '';

    while (!this.atEnd() && this.peek() !== '"') {
      const char = this.source[this.position];

      if (char === '\\') {
        result += this.source[this.position + 1] ?? '';
        this.position += 2;
        continue;
      }

      result += char;
      this.position += 1;
    }

    this.consume('"');
    return result;
  }

  private parseSymbol(): string {
    this.consume(':');
    let result = '';

    while (!this.atEnd() && /[\w?!]/.test(this.peek() as string)) {
      result += this.peek();
      this.position += 1;
    }

    return result;
  }

  private parseNumber(): number {
    const start = this.position;
    if (this.peek() === '-') this.position += 1;

    while (!this.atEnd() && /[\d.]/.test(this.peek() as string)) this.position += 1;

    return Number(this.source.slice(start, this.position));
  }

  private parseActionControllerParameters(): ParamValue {
    this.position += ACTION_CONTROLLER_PARAMS_PREFIX.length;
    this.skipWhitespace();
    const value = this.parseValue();

    while (!this.atEnd() && this.peek() !== '>') this.position += 1;
    if (this.peek() === '>') this.position += 1;

    return value;
  }
}

/**
 * Parses the `Parameters: {...}` payload Rails writes via `params.inspect`
 * (Ruby hash-rocket notation, optionally wrapped in `#<ActionController::Parameters ...>`).
 * Returns undefined on anything that doesn't fit — callers fall back to raw text.
 */
export function parseRubyInspect(input: string): ParamValue | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  try {
    return new RubyInspectParser(trimmed).parse();
  } catch {
    return undefined;
  }
}

export function isFilteredValue(value: ParamValue): boolean {
  return value === '[FILTERED]';
}
