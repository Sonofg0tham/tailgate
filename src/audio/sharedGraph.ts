/** Owns a lazily-created resource that must survive scene instance restarts. */
export class SharedGraph<T> {
  private value: T | null = null;

  constructor(private readonly build: () => T) {}

  getOrCreate(): T {
    this.value ??= this.build();
    return this.value;
  }
}
