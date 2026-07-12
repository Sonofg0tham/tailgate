export interface Stoppable { stop(): void }

export class SampleOwnership {
  private readonly owners = new Map<string, Stoppable>();

  claim(id: string, owner: Stoppable): void {
    this.release(id);
    this.owners.set(id, owner);
  }

  release(id: string): void {
    this.owners.get(id)?.stop();
    this.owners.delete(id);
  }
}
