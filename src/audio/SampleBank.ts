import { SAMPLE_MANIFEST, samplesFor, type SampleGroup } from './sampleManifest';
import { chooseVariant } from './samplePolicy';

type FetchBytes = (path: string) => Promise<ArrayBuffer>;
type Decode = (bytes: ArrayBuffer) => Promise<AudioBuffer>;

export class SampleBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly failedIds = new Set<string>();
  private loading: Promise<void> | null = null;
  private state: 'idle' | 'loading' | 'settled' = 'idle';
  private warned = false;

  constructor(
    private readonly fetchBytes: FetchBytes,
    private readonly decode: Decode,
    private readonly warn: (message: string) => void = console.warn
  ) {}

  preload(): Promise<void> {
    if (this.loading) return this.loading;
    this.state = 'loading';
    this.loading = Promise.all(SAMPLE_MANIFEST.map(async (entry) => {
      try {
        const bytes = await this.fetchBytes(entry.path);
        this.buffers.set(entry.id, await this.decode(bytes));
      } catch {
        this.failedIds.add(entry.id);
      }
    })).then(() => {
      this.state = 'settled';
      if (this.failedIds.size > 0) this.warnOnce();
    });
    return this.loading;
  }

  available(group: SampleGroup): boolean {
    return samplesFor(group).some((entry) => this.buffers.has(entry.id));
  }

  choose(group: SampleGroup, random01 = Math.random()): AudioBuffer | null {
    const candidates = samplesFor(group).filter((entry) => this.buffers.has(entry.id));
    const index = chooseVariant(candidates.length, random01);
    if (index < 0) {
      if (this.state === 'settled') this.warnOnce();
      return null;
    }
    return this.buffers.get(candidates[index].id) ?? null;
  }

  private warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    this.warn('Optional interaction audio is unavailable. Procedural security alerts remain active.');
  }
}
