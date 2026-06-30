import {
  AnalyticsUpIcon,
  Analytics01Icon,
  ApiIcon,
  ArchiveIcon,
  ArrowBigDownDashIcon,
  ArrowBigLeftDashIcon,
  ArrowBigRightDashIcon,
  ArrowBigUpDashIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  AiBrainIcon,
  AiChipIcon,
  AiProgrammingIcon,
  Atom01Icon,
  Award01Icon,
  BarChartIcon,
  BiometricDeviceIcon,
  BlockchainIcon,
  BluetoothIcon,
  BoltIcon,
  BookOpen01Icon,
  BotIcon,
  BracesIcon,
  BracketsIcon,
  BrainIcon,
  BugIcon,
  CloudDownloadIcon,
  CloudIcon,
  CloudServerIcon,
  CloudSyncIcon,
  CloudUploadIcon,
  CodeIcon,
  CommandLineIcon,
  ComputerIcon,
  ComputerTerminal01Icon,
  CoffeeIcon,
  CrownIcon,
  CubeIcon,
  DatabaseIcon,
  DatabaseSyncIcon,
  DnaIcon,
  EyeIcon,
  FileCodeIcon,
  FileZipIcon,
  FilterIcon,
  FireIcon,
  FirewallIcon,
  FlaskConicalIcon,
  FunctionIcon,
  GameController01Icon,
  GitBranchIcon,
  GitCommitIcon,
  GitForkIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  Globe02Icon,
  GpuIcon,
  HardDriveIcon,
  HeartIcon,
  Home01Icon,
  InfinityIcon,
  KeyboardIcon,
  KeyIcon,
  LayersIcon,
  LeafIcon,
  LockIcon,
  MagicWand01Icon,
  MagnetIcon,
  MailIcon,
  MessageIcon,
  MicroscopeIcon,
  MouseIcon,
  NeuralNetworkIcon,
  Package01Icon,
  PaintBrushIcon,
  Pen01Icon,
  PieChartIcon,
  RocketIcon,
  SatelliteIcon,
  SearchIcon,
  ServerStackIcon,
  ShieldIcon,
  SignalIcon,
  SourceCodeIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  TelescopeIcon,
  TerminalIcon,
  VariableIcon,
  WebhookIcon,
  WifiIcon,
} from "@hugeicons/core-free-icons";

// 96 icons organized in 3 pages of 32 each.
// Page 0: Dev & Code | Page 1: Infra & Hardware | Page 2: AI, Science & Design
export const WORKSPACE_ICON_PALETTE = [
  // Page 0 – Dev & Code
  { name: "CodeIcon", label: "Code", icon: CodeIcon },
  { name: "TerminalIcon", label: "Terminal", icon: TerminalIcon },
  { name: "ComputerTerminal01Icon", label: "Console", icon: ComputerTerminal01Icon },
  { name: "SourceCodeIcon", label: "Source Code", icon: SourceCodeIcon },
  { name: "BracketsIcon", label: "Brackets", icon: BracketsIcon },
  { name: "BracesIcon", label: "Braces", icon: BracesIcon },
  { name: "CommandLineIcon", label: "CLI", icon: CommandLineIcon },
  { name: "FunctionIcon", label: "Function", icon: FunctionIcon },
  { name: "VariableIcon", label: "Variable", icon: VariableIcon },
  { name: "ApiIcon", label: "API", icon: ApiIcon },
  { name: "WebhookIcon", label: "Webhook", icon: WebhookIcon },
  { name: "InfinityIcon", label: "Infinity", icon: InfinityIcon },
  { name: "GitBranchIcon", label: "Git", icon: GitBranchIcon },
  { name: "GitCommitIcon", label: "Commit", icon: GitCommitIcon },
  { name: "GitForkIcon", label: "Fork", icon: GitForkIcon },
  { name: "GitMergeIcon", label: "Merge", icon: GitMergeIcon },
  { name: "GitPullRequestIcon", label: "Pull Request", icon: GitPullRequestIcon },
  { name: "BugIcon", label: "Debug", icon: BugIcon },
  { name: "FlaskConicalIcon", label: "Testing", icon: FlaskConicalIcon },
  { name: "Package01Icon", label: "Package", icon: Package01Icon },
  { name: "ArchiveIcon", label: "Archive", icon: ArchiveIcon },
  { name: "FileCodeIcon", label: "Code File", icon: FileCodeIcon },
  { name: "FileZipIcon", label: "Zip", icon: FileZipIcon },
  { name: "FilterIcon", label: "Filter", icon: FilterIcon },
  { name: "SearchIcon", label: "Search", icon: SearchIcon },
  { name: "DatabaseIcon", label: "Database", icon: DatabaseIcon },
  { name: "DatabaseSyncIcon", label: "DB Sync", icon: DatabaseSyncIcon },
  { name: "BlockchainIcon", label: "Blockchain", icon: BlockchainIcon },
  { name: "BookOpen01Icon", label: "Docs", icon: BookOpen01Icon },
  { name: "Analytics01Icon", label: "Analytics", icon: Analytics01Icon },
  { name: "ArrowUpIcon", label: "Arrow Up", icon: ArrowUpIcon },
  { name: "ArrowDownIcon", label: "Arrow Down", icon: ArrowDownIcon },

  // Page 1 – Infra & Hardware
  { name: "ServerStackIcon", label: "Server", icon: ServerStackIcon },
  { name: "CloudIcon", label: "Cloud", icon: CloudIcon },
  { name: "CloudServerIcon", label: "Cloud Server", icon: CloudServerIcon },
  { name: "CloudUploadIcon", label: "Upload", icon: CloudUploadIcon },
  { name: "CloudDownloadIcon", label: "Download", icon: CloudDownloadIcon },
  { name: "CloudSyncIcon", label: "Cloud Sync", icon: CloudSyncIcon },
  { name: "Globe02Icon", label: "Web", icon: Globe02Icon },
  { name: "WifiIcon", label: "WiFi", icon: WifiIcon },
  { name: "BluetoothIcon", label: "Bluetooth", icon: BluetoothIcon },
  { name: "SignalIcon", label: "Signal", icon: SignalIcon },
  { name: "SatelliteIcon", label: "Satellite", icon: SatelliteIcon },
  { name: "CpuIcon", label: "CPU", icon: CpuIcon },
  { name: "GpuIcon", label: "GPU", icon: GpuIcon },
  { name: "LaptopIcon", label: "Laptop", icon: LaptopIcon },
  { name: "ComputerIcon", label: "Computer", icon: ComputerIcon },
  { name: "HardDriveIcon", label: "Hard Drive", icon: HardDriveIcon },
  { name: "KeyboardIcon", label: "Keyboard", icon: KeyboardIcon },
  { name: "MouseIcon", label: "Mouse", icon: MouseIcon },
  { name: "ShieldIcon", label: "Security", icon: ShieldIcon },
  { name: "LockIcon", label: "Lock", icon: LockIcon },
  { name: "KeyIcon", label: "Key", icon: KeyIcon },
  { name: "FirewallIcon", label: "Firewall", icon: FirewallIcon },
  { name: "BiometricDeviceIcon", label: "Biometric", icon: BiometricDeviceIcon },
  { name: "EyeIcon", label: "Eye", icon: EyeIcon },
  { name: "GameController01Icon", label: "Game", icon: GameController01Icon },
  { name: "Home01Icon", label: "Home", icon: Home01Icon },
  { name: "ArrowLeftIcon", label: "Arrow Left", icon: ArrowLeftIcon },
  { name: "ArrowRightIcon", label: "Arrow Right", icon: ArrowRightIcon },
  { name: "ArrowBigUpDashIcon", label: "Arrow Up Bold", icon: ArrowBigUpDashIcon },
  { name: "ArrowBigDownDashIcon", label: "Arrow Down Bold", icon: ArrowBigDownDashIcon },
  { name: "ArrowBigLeftDashIcon", label: "Arrow Left Bold", icon: ArrowBigLeftDashIcon },
  { name: "ArrowBigRightDashIcon", label: "Arrow Right Bold", icon: ArrowBigRightDashIcon },

  // Page 2 – AI, Science & Design
  { name: "BrainIcon", label: "AI", icon: BrainIcon },
  { name: "AiBrainIcon", label: "AI Brain", icon: AiBrainIcon },
  { name: "AiChipIcon", label: "AI Chip", icon: AiChipIcon },
  { name: "NeuralNetworkIcon", label: "Neural Net", icon: NeuralNetworkIcon },
  { name: "AiProgrammingIcon", label: "AI Coding", icon: AiProgrammingIcon },
  { name: "SparklesIcon", label: "Sparkles", icon: SparklesIcon },
  { name: "MagicWand01Icon", label: "Magic", icon: MagicWand01Icon },
  { name: "BotIcon", label: "Bot", icon: BotIcon },
  { name: "MicroscopeIcon", label: "Microscope", icon: MicroscopeIcon },
  { name: "Atom01Icon", label: "Science", icon: Atom01Icon },
  { name: "DnaIcon", label: "DNA", icon: DnaIcon },
  { name: "TelescopeIcon", label: "Telescope", icon: TelescopeIcon },
  { name: "LayersIcon", label: "Layers", icon: LayersIcon },
  { name: "CubeIcon", label: "3D", icon: CubeIcon },
  { name: "PaintBrushIcon", label: "Paint", icon: PaintBrushIcon },
  { name: "Pen01Icon", label: "Write", icon: Pen01Icon },
  { name: "BarChartIcon", label: "Bar Chart", icon: BarChartIcon },
  { name: "PieChartIcon", label: "Pie Chart", icon: PieChartIcon },
  { name: "AnalyticsUpIcon", label: "Trending", icon: AnalyticsUpIcon },
  { name: "MessageIcon", label: "Message", icon: MessageIcon },
  { name: "MailIcon", label: "Mail", icon: MailIcon },
  { name: "CoffeeIcon", label: "Coffee", icon: CoffeeIcon },
  { name: "RocketIcon", label: "Rocket", icon: RocketIcon },
  { name: "FireIcon", label: "Fire", icon: FireIcon },
  { name: "BoltIcon", label: "Bolt", icon: BoltIcon },
  { name: "TargetIcon", label: "Target", icon: TargetIcon },
  { name: "MagnetIcon", label: "Magnet", icon: MagnetIcon },
  { name: "StarIcon", label: "Star", icon: StarIcon },
  { name: "CrownIcon", label: "Crown", icon: CrownIcon },
  { name: "Award01Icon", label: "Award", icon: Award01Icon },
  { name: "HeartIcon", label: "Heart", icon: HeartIcon },
  { name: "LeafIcon", label: "Eco", icon: LeafIcon },
] as const;

export const PALETTE_PAGE_SIZE = 32;

export type WorkspaceIconName = (typeof WORKSPACE_ICON_PALETTE)[number]["name"];

// Cache for the full icon library, loaded on demand
let allIconsCache: Record<string, unknown> | null = null;

export async function loadAllIcons(): Promise<Record<string, unknown>> {
  if (!allIconsCache) {
    allIconsCache = await import("@hugeicons/core-free-icons") as Record<string, unknown>;
  }
  return allIconsCache;
}

function camelToLabel(name: string): string {
  return name
    .replace(/Icon$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/([0-9]+)/g, " $1")
    .trim()
    .replace(/\s+/g, " ");
}

export type IconSearchResult = { name: string; label: string; icon: unknown };

export function searchIcons(
  query: string,
  allIcons: Record<string, unknown>,
  limit = 3,
): IconSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: IconSearchResult[] = [];
  for (const [key, value] of Object.entries(allIcons)) {
    if (!key.endsWith("Icon")) continue;
    const label = camelToLabel(key);
    if (key.toLowerCase().includes(q) || label.toLowerCase().includes(q)) {
      results.push({ name: key, label, icon: value });
    }
  }
  results.sort((a, b) => {
    const aL = a.label.toLowerCase();
    const bL = b.label.toLowerCase();
    if (aL === q) return -1;
    if (bL === q) return 1;
    if (aL.startsWith(q) && !bL.startsWith(q)) return -1;
    if (bL.startsWith(q) && !aL.startsWith(q)) return 1;
    return aL.localeCompare(bL);
  });
  return results.slice(0, limit);
}

export function getWorkspaceIcon(name: string): unknown {
  const palette = WORKSPACE_ICON_PALETTE.find((e) => e.name === name);
  if (palette) return palette.icon;
  return allIconsCache?.[name] ?? null;
}
