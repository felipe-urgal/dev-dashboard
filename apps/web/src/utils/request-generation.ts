export class RequestGeneration {
  private generation = 0;

  public capture(): number {
    return this.generation;
  }

  public invalidate(): number {
    this.generation += 1;
    return this.generation;
  }

  public isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

export class RequestGate {
  private activeToken: symbol | undefined;

  public begin(label = 'request'): symbol | null {
    if (this.activeToken) {
      return null;
    }

    const token = Symbol(label);
    this.activeToken = token;
    return token;
  }

  public finish(token: symbol): boolean {
    if (this.activeToken !== token) {
      return false;
    }

    this.activeToken = undefined;
    return true;
  }

  public invalidate(): void {
    this.activeToken = undefined;
  }
}
