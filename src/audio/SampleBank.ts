import { SAMPLE_MANIFEST, samplesFor, type SampleGroup } from './sampleManifest';
import { chooseVariant } from './samplePolicy';

type FetchBytes = (path: string) => Promise<ArrayBuffer>;
type Decode = (bytes: ArrayBuffer) => Promise<AudioBuffer>;

export class SampleBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private warned = false;

  constructor(
    private readonly fetchBytes: FetchBytes,
    private readonly decode: Decode,
    private readonly warn: (message: string) => void = console.warn
  ) {}

  preload(): Promise<void> {
    this.loading ??= Promise.all(SAMPLE_MANIFEST.map(async (entry) => {
      try {
        const bytes = await this.fetchBytes(entry.path);
        this.buffers.set(entry.id, await this.decode(bytes));
      } catch {
        if (!this.warned) {
          this.warned = true;
          this.warn('Optional interaction audio could not be decoded. Procedural alerts remain active.');
        }
      }
    })).then(() => undefined);
    return this.loading;
  }

  available(group: SampleGroup): boolean {
    return samplesFor(group).some((entry) => this.buffers.has(entry.id));
  }

  choose(group: SampleGroup, random01 = Math.random()): AudioBuffer | null {
    const candidates = samplesFor(group).filter((entry) => this.buffers.has(entry.id));
    const index = chooseVariant(candidates.length, random01);
    return index < 0 ? null : (this.buffers.get(candidates[index].id) ?? null);
  }
}
