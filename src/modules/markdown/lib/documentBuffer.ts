import { joinFrontmatter, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

export class MarkdownDocumentBuffer {
  private frontmatterValue: string;
  private savedBody: string;
  private body: string;
  private savedRaw: string;
  private baselineBody: string | null;

  constructor(raw: string) {
    const { frontmatter, body } = splitFrontmatter(raw);
    this.frontmatterValue = frontmatter;
    this.savedBody = body;
    this.body = body;
    this.savedRaw = raw;
    this.baselineBody = null;
  }

  get frontmatter(): string {
    return this.frontmatterValue;
  }

  getBody(): string {
    return this.body;
  }

  setBody(next: string): void {
    this.body = next;
  }

  // What the untouched document serializes to. The markdown round trip normalizes
  // formatting on purpose (a hand-wrapped paragraph comes back as one line), so the
  // editor's output never equals a hand-written file and a plain comparison against
  // the text on disk reports every freshly opened file as modified.
  setBaseline(body: string): void {
    this.baselineBody = body;
  }

  isDirty(): boolean {
    if (this.body === this.savedBody) return false;
    return this.body !== this.baselineBody;
  }

  contentToSave(): string | null {
    if (!this.isDirty()) return null;
    return joinFrontmatter(this.frontmatterValue, this.body);
  }

  markSaved(): void {
    this.savedBody = this.body;
    this.savedRaw = joinFrontmatter(this.frontmatterValue, this.body);
    // The file on disk now carries the normalized text, so there is nothing left to
    // excuse: dropping the baseline keeps an undo back to the loaded form saveable.
    this.baselineBody = null;
  }

  replaceFromDisk(raw: string): boolean {
    if (raw === this.savedRaw) return false;
    const { frontmatter, body } = splitFrontmatter(raw);
    this.frontmatterValue = frontmatter;
    this.savedRaw = raw;
    this.savedBody = body;
    this.body = body;
    this.baselineBody = null;
    return true;
  }
}
