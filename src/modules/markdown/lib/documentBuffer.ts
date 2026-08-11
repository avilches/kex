import { joinFrontmatter, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

export class MarkdownDocumentBuffer {
  private frontmatterValue: string;
  private savedBody: string;
  private body: string;
  private savedRaw: string;

  constructor(raw: string) {
    const { frontmatter, body } = splitFrontmatter(raw);
    this.frontmatterValue = frontmatter;
    this.savedBody = body;
    this.body = body;
    this.savedRaw = raw;
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

  isDirty(): boolean {
    return this.body !== this.savedBody;
  }

  contentToSave(): string | null {
    if (!this.isDirty()) return null;
    return joinFrontmatter(this.frontmatterValue, this.body);
  }

  markSaved(): void {
    this.savedBody = this.body;
    this.savedRaw = joinFrontmatter(this.frontmatterValue, this.body);
  }

  replaceFromDisk(raw: string): boolean {
    if (raw === this.savedRaw) return false;
    const { frontmatter, body } = splitFrontmatter(raw);
    this.frontmatterValue = frontmatter;
    this.savedRaw = raw;
    this.savedBody = body;
    this.body = body;
    return true;
  }
}
