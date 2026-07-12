export interface Stoppable { stop(): void; disconnect?: () => void }

export class SampleOwnership {
  private readonly owners = new Map<string, Stoppable>();
  private readonly voices = new Map<string, Set<Stoppable>>();

  claim(id: string, owner: Stoppable): void {
    this.release(id);
    this.owners.set(id, owner);
  }

  release(id: string): void {
    this.owners.get(id)?.stop();
    this.owners.delete(id);
    const voices = this.voices.get(id);
    if (voices) {
      for (const voice of voices) {
        voice.stop();
        voice.disconnect?.();
      }
      this.voices.delete(id);
    }
  }

  addVoice(id: string, voice: Stoppable): () => void {
    const voices = this.voices.get(id) ?? new Set<Stoppable>();
    voices.add(voice);
    this.voices.set(id, voices);
    return () => {
      if (!voices.delete(voice)) return;
      voice.disconnect?.();
      if (voices.size === 0) this.voices.delete(id);
    };
  }
}
