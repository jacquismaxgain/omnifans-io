import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  Check,
  ChevronRight,
  Copy,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  Heart,
  Images,
  Inbox,
  Gift,
  Globe,
  KeyRound,
  LayoutDashboard,
  Link2,
  Lock,
  LockOpen,
  MessageCircle,
  Mic,
  Moon,
  Pause,
  Play,
  PlugZap,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Settings as SettingsIcon,
  Shield,
  Smile,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  UserPlus,
  Users,
  Video,
  Wallet,
  Pencil,
  Radio,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Trusted records API (same-origin "actions" endpoint)               */
/* ------------------------------------------------------------------ */

async function callApi(action: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  let payload: any = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }
  if (!res.ok || payload.error) {
    throw new Error(payload.error || `HTTP ${res.status}`);
  }
  return payload.data;
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/*  Telegram Bot API via le proxy interne (endpoint "actions")         */
/*  Le frontend ne contacte jamais Telegram directement : le token     */
/*  transite uniquement par le backend, qui relaie l'appel côté        */
/*  serveur et renvoie la réponse de l'API du bot au frontend.         */
/* ------------------------------------------------------------------ */

async function telegramProxy(method: string, token: string, payload: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "telegram_proxy", method, token, payload }),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data?.error || data?.ok === false) {
    throw new Error(data?.description || data?.error || `HTTP ${res.status}`);
  }
  return data?.result ?? data;
}

/* ------------------------------------------------------------------ */
/*  OnlyFans / MYM.fans en live, via le même endpoint interne          */
/*  « actions » : le backend relaie l'appel côté serveur avec la clé   */
/*  du modèle. Le navigateur n'appelle jamais ces plateformes.         */
/* ------------------------------------------------------------------ */

async function platformProxy(
  type: "onlyfans_proxy" | "mym_proxy",
  method: string,
  credential: { api_key?: string; token?: string },
  payload: Record<string, unknown> = {}
): Promise<any> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, method, ...credential, payload }),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data?.error || data?.ok === false) {
    throw new Error(data?.description || data?.error || `HTTP ${res.status}`);
  }
  return data?.result ?? data;
}

/* ------------------------------------------------------------------ */
/*  Types & seed data                                                  */
/* ------------------------------------------------------------------ */

type Page =
  | "dashboard"
  | "live"
  | "inbox"
  | "gallery"
  | "persona"
  | "broadcast"
  | "flows"
  | "stats"
  | "settings";

type Platform = "telegram" | "onlyfans" | "mym";

const PLATFORM_META: Record<Platform, { label: string; short: string; color: string; soft: string }> = {
  telegram: { label: "Telegram", short: "TG", color: "#229ed9", soft: "rgba(34,158,217,0.14)" },
  onlyfans: { label: "OnlyFans", short: "OF", color: "#00aff0", soft: "rgba(0,175,240,0.14)" },
  mym: { label: "MYM.fans", short: "MYM", color: "#e84393", soft: "rgba(232,67,147,0.14)" },
};

const PLATFORMS: Platform[] = ["telegram", "onlyfans", "mym"];

/* État d'un PPV tel que le fan le voit : payant verrouillé, déverrouillé
   après paiement, ou offert gratuitement (teaser / cadeau). */
type PpvState = "locked" | "unlocked" | "free";

type Msg = {
  from: "fan" | "me" | "ai";
  text: string;
  time: string;
  media?: string;
  ppv?: {
    title: string;
    kind: "Photo" | "Vidéo";
    gradient: string;
    priceLabel: string;
    detail: string;
    state: PpvState;
    paidWhen?: string;
  };
};

type Conv = {
  id: string;
  botId: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  platform: Platform;
  last: string;
  time: string;
  unread: number;
  aiPaused: boolean;
  spent: number;
  unlockPrice: number;
  joined: string;
  source: string;
  chatId: number;
  messages: Msg[];
};

type MediaItem = {
  id: string;
  title: string;
  kind: "Photo" | "Vidéo";
  price: number; // Telegram Stars
  ofPrice: number; // OnlyFans USD
  mymPrice: number; // MYM EUR
  source: Platform;
  sales: number;
  gradient: string;
  remote?: boolean;
};

type Campaign = {
  id: string;
  title: string;
  audience: string;
  status: "Envoyée" | "Brouillon" | "Programmée";
  sent: number;
  revenue: number;
  when: string;
};

type IntegrationState = {
  token: string;
  username: string;
  connected: boolean;
  autoSync: boolean;
  recordId: string | null;
  lastTest: "ok" | "fail" | null;
};

/* Un bot / modèle : ses propres accès Telegram + OnlyFans + MYM.
   Persisté dans la collection « bots » (model_name, telegram_token,
   telegram_username, telegram_avatar_url, onlyfans_key, mym_token,
   is_connected, fans_count…). */
type BotModel = {
  id: string;
  recordId: string | null;
  modelName: string;
  telegramToken: string;
  telegramUsername: string;
  telegramAvatarUrl: string;
  onlyfansKey: string;
  onlyfansUsername: string;
  mymToken: string;
  connected: boolean;
  fansCount: number;
  fansOnline: number;
  balanceStars: number;
  revenueToday: number;
  gradient: string;
  remote?: boolean;
};

const SEED_BOTS: BotModel[] = [
  {
    id: "bot-sofia",
    recordId: null,
    modelName: "Sofia Laurent",
    telegramToken: "",
    telegramUsername: "@atelier_prive_bot",
    telegramAvatarUrl: "",
    onlyfansKey: "",
    onlyfansUsername: "@sofia.laurent",
    mymToken: "",
    connected: true,
    fansCount: 1284,
    fansOnline: 23,
    balanceStars: 11590,
    revenueToday: 450,
    gradient: "linear-gradient(135deg,#8b5cf6,#ec4899)",
  },
  {
    id: "bot-luna",
    recordId: null,
    modelName: "Luna Moreau",
    telegramToken: "",
    telegramUsername: "@luna_vip_bot",
    telegramAvatarUrl: "",
    onlyfansKey: "",
    onlyfansUsername: "@luna.moreau",
    mymToken: "",
    connected: true,
    fansCount: 862,
    fansOnline: 11,
    balanceStars: 3240,
    revenueToday: 300,
    gradient: "linear-gradient(135deg,#0ea5e9,#8b5cf6)",
  },
  {
    id: "bot-mia",
    recordId: null,
    modelName: "Mia Chen",
    telegramToken: "",
    telegramUsername: "@mia_chen_bot",
    telegramAvatarUrl: "",
    onlyfansKey: "",
    onlyfansUsername: "",
    mymToken: "",
    connected: false,
    fansCount: 148,
    fansOnline: 0,
    balanceStars: 0,
    revenueToday: 0,
    gradient: "linear-gradient(135deg,#f59e0b,#ef4444)",
  },
];

const INTEGRATION_CONFIG: Record<
  Platform,
  { title: string; icon: any; blurb: string; tokenLabel: string; placeholder: string; help: string }
> = {
  telegram: {
    title: "Telegram Bot Token",
    icon: Send,
    blurb: "Utilisé pour vendre en Telegram Stars. Créé via @BotFather (/newbot), puis collez le token HTTP API ici.",
    tokenLabel: "BotFather token",
    placeholder: "123456789:AAH…",
    help: "Le bot reçoit les fans, envoie les aperçus et encaisse les paiements en Stars. Tous les appels passent par le proxy interne de l'app : le backend relaie les requêtes vers https://api.telegram.org côté serveur, le navigateur n'appelle jamais cette adresse directement.",
  },
  onlyfans: {
    title: "OnlyFans API Key",
    icon: Heart,
    blurb: "Importe ton contenu OnlyFans et sync les prix vers Telegram et MYM.",
    tokenLabel: "API Key OnlyFans",
    placeholder: "of_live_…",
    help: "Connexion par nom d'utilisateur + clé API. Aucun mot de passe n'est conservé.",
  },
  mym: {
    title: "MYM.fans Token",
    icon: Sparkles,
    blurb: "Synchronise ton catalogue MYM et tes revenus dans le même CRM.",
    tokenLabel: "API Token MYM",
    placeholder: "mym_…",
    help: "Token généré dans MYM → Paramètres → Développeurs.",
  },
};

/* Demo stats shown once a platform is connected */
const INTEGRATION_STATS: Record<Platform, { subscribers: number; earningsLabel: string; balanceLabel: string }> = {
  telegram: { subscribers: 0, earningsLabel: "11 590 Stars encaissés", balanceLabel: "11,590 Stars" },
  onlyfans: { subscribers: 1248, earningsLabel: "$1,284.50 (30 j)", balanceLabel: "$1,284.50" },
  mym: { subscribers: 386, earningsLabel: "€842.30 (30 j)", balanceLabel: "€842.30" },
};

const REVENUE_SOURCES: { platform: Platform; label: string; usd: number; display: string; color: string }[] = [
  { platform: "telegram", label: "Telegram Stars", usd: 150.67, display: "11 590 Stars", color: "#8b5cf6" },
  { platform: "onlyfans", label: "OnlyFans", usd: 1284.5, display: "$1,284.50", color: "#0ea5e9" },
  { platform: "mym", label: "MYM.fans", usd: 908.68, display: "€842.30", color: "#ec4899" },
];
const REVENUE_TOTAL = REVENUE_SOURCES.reduce((a, s) => a + s.usd, 0);

const priceFor = (m: MediaItem, p: Platform) => (p === "telegram" ? m.price : p === "onlyfans" ? m.ofPrice : m.mymPrice);

const fmtPrice = (n: number, p: Platform) =>
  p === "telegram" ? `${n.toLocaleString("fr-FR")} Stars` : p === "onlyfans" ? `$${n.toFixed(2)}` : `€${n.toFixed(2)}`;

const SALES_7D = [
  { day: "Lun", stars: 1240, usd: 16.1 },
  { day: "Mar", stars: 1680, usd: 21.8 },
  { day: "Mer", stars: 1425, usd: 18.5 },
  { day: "Jeu", stars: 2110, usd: 27.4 },
  { day: "Ven", stars: 1890, usd: 24.6 },
  { day: "Sam", stars: 2640, usd: 34.3 },
  { day: "Dim", stars: 1605, usd: 20.9 },
];

const RECENT_SALES = [
  { fan: "Lucas M.", item: "Studio Session — Pack 12", stars: 450, time: "il y a 4 min" },
  { fan: "Emma R.", item: "Backstage Video (2:14)", stars: 300, time: "il y a 19 min" },
  { fan: "Noah B.", item: "Morning Routine Set", stars: 150, time: "il y a 32 min" },
  { fan: "Léa D.", item: "Q&A Exclusive — Replay", stars: 600, time: "il y a 1 h" },
  { fan: "Hugo P.", item: "Travel Diary — Lisbonne", stars: 250, time: "il y a 2 h" },
];

const SEED_CONVS: Conv[] = [
  {
    id: "c1",
    botId: "bot-sofia",
    name: "Lucas M.",
    handle: "@lucas_m75",
    initials: "LM",
    color: "#8b5cf6",
    platform: "telegram",
    last: "Parfait, envoie-moi le pack studio",
    time: "09:41",
    unread: 2,
    aiPaused: false,
    spent: 2340,
    unlockPrice: 450,
    joined: "12 mars 2026",
    source: "Lien tracking /bio",
    chatId: 123456789,
    messages: [
      { from: "fan", text: "Hey ! J'ai vu ton post sur le channel, le pack studio m'intéresse", time: "09:32" },
      { from: "ai", text: "Hello Lucas, ravie que ça te plaise. Le pack contient 12 photos exclusives de la session de jeudi, débloquable pour 450 Stars.", time: "09:33" },
      { from: "fan", text: "Tu peux m'envoyer un aperçu ?", time: "09:38" },
      { from: "ai", text: "Bien sûr, voici un aperçu flouté. Le contenu complet se débloque juste après le paiement en Stars.", time: "09:39", media: "Studio Session — Aperçu", ppv: { title: "Studio Session — Pack 12", kind: "Photo", gradient: "linear-gradient(135deg,#8b5cf6,#ec4899)", priceLabel: "450 Stars", detail: "12 photos", state: "locked" } },
      { from: "fan", text: "Parfait, envoie-moi le pack studio", time: "09:41" },
    ],
  },
  {
    id: "c2",
    botId: "bot-luna",
    name: "Emma R.",
    handle: "@emma_rb",
    initials: "ER",
    color: "#ec4899",
    platform: "onlyfans",
    last: "La vidéo backstage était top, merci !",
    time: "09:12",
    unread: 0,
    aiPaused: true,
    spent: 1180,
    unlockPrice: 300,
    joined: "28 fév. 2026",
    source: "Profil OnlyFans (sync)",
    chatId: 234567891,
    messages: [
      { from: "fan", text: "Bonjour, la vidéo backstage est toujours dispo ?", time: "08:57" },
      { from: "ai", text: "Oui Emma, elle dure 2 min 14 et elle est à $30.00 sur OnlyFans. Tu veux que je te l'envoie en PPV ?", time: "08:58", media: "Backstage Video (2:14)", ppv: { title: "Backstage Video (2:14)", kind: "Vidéo", gradient: "linear-gradient(135deg,#0ea5e9,#8b5cf6)", priceLabel: "$30.00", detail: "1 vidéo · 2:14", state: "unlocked", paidWhen: "Il y a 2 min" } },
      { from: "fan", text: "Oui je la prends", time: "09:05" },
      { from: "me", text: "Merci Emma ! Je te prépare aussi une petite surprise pour la semaine prochaine.", time: "09:10" },
      { from: "fan", text: "La vidéo backstage était top, merci !", time: "09:12" },
    ],
  },
  {
    id: "c3",
    botId: "bot-sofia",
    name: "Noah B.",
    handle: "@noahb_",
    initials: "NB",
    color: "#0ea5e9",
    platform: "telegram",
    last: "C'est combien pour le set du matin ?",
    time: "Hier",
    unread: 1,
    aiPaused: false,
    spent: 640,
    unlockPrice: 150,
    joined: "3 mars 2026",
    source: "Lien tracking /story",
    chatId: 345678912,
    messages: [
      { from: "fan", text: "Salut, j'ai vu le teaser du morning routine", time: "Hier 21:04" },
      { from: "ai", text: "Hello Noah ! Le Morning Routine Set est à 150 Stars, avec 8 contenus exclusifs.", time: "Hier 21:05" },
      { from: "fan", text: "C'est combien pour le set du matin ?", time: "Hier 21:06" },
    ],
  },
  {
    id: "c4",
    botId: "bot-sofia",
    name: "Léa D.",
    handle: "@lea_dl",
    initials: "LD",
    color: "#f59e0b",
    platform: "mym",
    last: "Je veux bien le replay du Q&A",
    time: "Hier",
    unread: 0,
    aiPaused: false,
    spent: 1925,
    unlockPrice: 600,
    joined: "19 janv. 2026",
    source: "Profil MYM (sync)",
    chatId: 456789123,
    messages: [
      { from: "fan", text: "Le live Q&A d'hier était génial", time: "Hier 18:22" },
      { from: "ai", text: "Merci Léa ! Le replay complet avec les questions bonus est dispo pour €52.00 sur MYM.", time: "Hier 18:24", media: "Q&A Exclusive — Replay", ppv: { title: "Q&A Exclusive — Replay", kind: "Vidéo", gradient: "linear-gradient(135deg,#10b981,#0ea5e9)", priceLabel: "€52.00", detail: "1 vidéo · replay complet", state: "locked" } },
      { from: "fan", text: "Je veux bien le replay du Q&A", time: "Hier 18:26" },
    ],
  },
  {
    id: "c5",
    botId: "bot-luna",
    name: "Hugo P.",
    handle: "@hugo_prt",
    initials: "HP",
    color: "#10b981",
    platform: "telegram",
    last: "Lisbonne avait l'air incroyable",
    time: "Lun.",
    unread: 0,
    aiPaused: true,
    spent: 410,
    unlockPrice: 250,
    joined: "7 fév. 2026",
    source: "Lien tracking /bio",
    chatId: 567891234,
    messages: [
      { from: "fan", text: "Tes stories à Lisbonne donnent trop envie", time: "Lun. 12:40" },
      { from: "me", text: "Merci Hugo ! Je mets le carnet de voyage complet dans le bot cette semaine.", time: "Lun. 12:52" },
      { from: "fan", text: "Lisbonne avait l'air incroyable", time: "Lun. 12:55" },
    ],
  },
];

const GRADIENTS = [
  "linear-gradient(135deg,#8b5cf6,#ec4899)",
  "linear-gradient(135deg,#0ea5e9,#8b5cf6)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#10b981,#0ea5e9)",
  "linear-gradient(135deg,#6366f1,#22d3ee)",
  "linear-gradient(135deg,#f43f5e,#f59e0b)",
  "linear-gradient(135deg,#14b8a6,#84cc16)",
  "linear-gradient(135deg,#a855f7,#6366f1)",
];

const SEED_MEDIA: MediaItem[] = [
  { id: "m1", title: "Studio Session — Pack 12", kind: "Photo", price: 450, ofPrice: 45, mymPrice: 39, source: "telegram", sales: 38, gradient: GRADIENTS[0] },
  { id: "m2", title: "Backstage Video (2:14)", kind: "Vidéo", price: 300, ofPrice: 30, mymPrice: 26, source: "onlyfans", sales: 52, gradient: GRADIENTS[1] },
  { id: "m3", title: "Morning Routine Set", kind: "Photo", price: 150, ofPrice: 15, mymPrice: 12, source: "telegram", sales: 87, gradient: GRADIENTS[2] },
  { id: "m4", title: "Q&A Exclusive — Replay", kind: "Vidéo", price: 600, ofPrice: 60, mymPrice: 52, source: "mym", sales: 21, gradient: GRADIENTS[3] },
  { id: "m5", title: "Travel Diary — Lisbonne", kind: "Photo", price: 250, ofPrice: 25, mymPrice: 21, source: "onlyfans", sales: 44, gradient: GRADIENTS[4] },
  { id: "m6", title: "Golden Hour Portraits", kind: "Photo", price: 350, ofPrice: 35, mymPrice: 30, source: "telegram", sales: 29, gradient: GRADIENTS[5] },
  { id: "m7", title: "Atelier — Behind the Scenes", kind: "Vidéo", price: 500, ofPrice: 50, mymPrice: 43, source: "mym", sales: 17, gradient: GRADIENTS[6] },
  { id: "m8", title: "Sunday Reset Routine", kind: "Photo", price: 200, ofPrice: 20, mymPrice: 17, source: "onlyfans", sales: 63, gradient: GRADIENTS[7] },
];

const SEED_CAMPAIGNS: Campaign[] = [
  { id: "b1", title: "Promo week-end — Studio Pack -30%", audience: "Fans actifs (30 j)", status: "Envoyée", sent: 412, revenue: 6840, when: "Sam. 10:00" },
  { id: "b2", title: "Nouveau replay Q&A disponible", audience: "Acheteurs Gallery", status: "Envoyée", sent: 268, revenue: 3150, when: "Jeu. 19:30" },
  { id: "b3", title: "Relance paniers abandonnés", audience: "Conversations sans achat", status: "Programmée", sent: 0, revenue: 0, when: "Demain 18:00" },
];

const TRACKING_LINKS = [
  { name: "omnifans.io/bio", clicks: 1842, conv: "12,4 %", revenue: "4 210 Stars" },
  { name: "omnifans.io/story", clicks: 967, conv: "9,1 %", revenue: "1 875 Stars" },
  { name: "omnifans.io/channel-post-42", clicks: 1204, conv: "10,8 %", revenue: "2 640 Stars" },
  { name: "omnifans.io/youtube-desc", clicks: 655, conv: "7,3 %", revenue: "1 120 Stars" },
];

/* Composer toolbar data (Fan Inbox) */
const EMOJIS = ["😀", "😁", "😍", "😘", "😎", "🤩", "😉", "😜", "🥰", "😇", "🔥", "⭐", "❤️", "💜", "✨", "🎉", "👍", "🙏", "💋", "🌹", "📸", "🎥", "💎", "👀"];

const QUICK_REPLIES = [
  "Merci pour ton soutien, ça me fait super plaisir 💜",
  "Le nouveau pack vient de sortir dans la Gallery, tu veux que je te l'envoie ?",
  "Je suis en live Q&A jeudi à 20 h, tu seras là ?",
  "Promo du week-end : -30 % sur une sélection de la Gallery 🎉",
  "Je te prépare une petite surprise pour très bientôt ✨",
];

const SCRIPTS = [
  { title: "Accueil nouveau fan", text: "Bienvenue dans mon univers ! Dis-moi ce qui te ferait plaisir : un pack photo, une vidéo exclusive ou le replay du dernier live ?" },
  { title: "Teaser nouveau contenu", text: "Je viens de tourner quelque chose de spécial rien que pour vous… Tu veux être le premier à le voir ? Je te l'envoie en PPV." },
  { title: "Relance douce sur le prix", text: "Je comprends pour le budget. Je peux te proposer un aperçu gratuit et le pack découverte à petit prix pour commencer." },
  { title: "Remerciement après achat", text: "Merci pour ton achat, ça me soutient énormément ! Reste dans le coin, une surprise arrive cette semaine." },
  { title: "Invitation au live", text: "Je serai en live jeudi à 20 h pour un Q&A exclusif. Pose-moi tes questions, je répondrai en direct !" },
];

const VOICE_STYLES = ["Douce & naturelle", "Énergique & fun", "Chuchotée ASMR", "Pro & posée"];

const NAV: { id: Page; label: string; icon: any; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "live", label: "Live Models", icon: Radio },
  { id: "inbox", label: "Fan Inbox", icon: Inbox, badge: "3" },
  { id: "gallery", label: "Gallery", icon: Images },
  { id: "persona", label: "AI Persona", icon: Bot },
  { id: "broadcast", label: "Broadcast", icon: Send },
  { id: "flows", label: "Flows", icon: Workflow },
  { id: "stats", label: "Statistics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const fmt = (n: number) => n.toLocaleString("fr-FR");
const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Toggle({ on, onClick, small }: { on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative shrink-0 rounded-full transition-colors ${small ? "h-5 w-9" : "h-6 w-11"} ${
        on ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
          small ? "h-4 w-4" : "h-5 w-5"
        } ${on ? (small ? "left-[18px]" : "left-[22px]") : "left-[2px]"}`}
      />
    </button>
  );
}

function Avatar({ initials, color, size = "md" }: { initials: string; color: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-8 w-8 text-[11px]" : size === "lg" ? "h-14 w-14 text-base" : "h-10 w-10 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${s}`}
      style={{ background: color }}
    >
      {initials}
    </span>
  );
}

/* Avatar d'un bot / modèle : vraie photo de profil si le backend en a
   renvoyé une (getUserProfilePhotos), sinon initiale sur dégradé.
   Bordure + point verts pulsants quand le bot est LIVE. */
function LiveAvatar({
  name,
  src,
  gradient,
  size = "md",
  live,
}: {
  name: string;
  src?: string;
  gradient: string;
  size?: "sm" | "md" | "lg" | "xl";
  live?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const s =
    size === "sm"
      ? "h-8 w-8 text-[11px]"
      : size === "lg"
        ? "h-14 w-14 text-base"
        : size === "xl"
          ? "h-20 w-20 text-xl"
          : "h-10 w-10 text-xs";
  const initials =
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  const showImg = !!src && !imgError;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${s} ${
        live ? "ring-2 ring-[var(--good)] ring-offset-2 ring-offset-[var(--surface)]" : ""
      }`}
      style={showImg ? undefined : { background: gradient }}
    >
      {showImg ? (
        <img src={src} alt={name} onError={() => setImgError(true)} className="h-full w-full rounded-full object-cover" />
      ) : (
        initials
      )}
      {live && (
        <span className="pulse-dot absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[var(--good)] ring-2 ring-[var(--surface)]" />
      )}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] ${className}`}>
      {children}
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "accent" }) {
  const tones: Record<string, string> = {
    neutral: "bg-[var(--surface-2)] text-[var(--ink-2)]",
    good: "bg-[var(--good-soft)] text-[var(--good)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function PlatformBadge({ platform, withLabel = true }: { platform: Platform; withLabel?: boolean }) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ background: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/85" />
      {withLabel ? meta.label : meta.short}
    </span>
  );
}

function Modal({
  title,
  icon: Icon,
  onClose,
  children,
  wide,
}: {
  title: string;
  icon: any;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`max-h-[88dvh] w-full overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [aiOn, setAiOn] = useState(true);
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(3);
  const [toast, setToast] = useState<string | null>(null);
  const [backend, setBackend] = useState<"checking" | "online" | "offline">("checking");
  const [revView, setRevView] = useState<"donut" | "details">("donut");

  const [convs, setConvs] = useState<Conv[]>(SEED_CONVS);
  const [activeConvId, setActiveConvId] = useState("c1");
  const [chatInput, setChatInput] = useState("");

  /* Composer toolbar (Fan Inbox) */
  const [panel, setPanel] = useState<null | "voice" | "favs" | "ppv" | "emoji" | "library">(null);
  const [attached, setAttached] = useState<{ item: MediaItem; price: number } | null>(null);
  const [voiceStyle, setVoiceStyle] = useState(VOICE_STYLES[0]);
  const [voiceText, setVoiceText] = useState("");
  const [ppvId, setPpvId] = useState<string | null>(null);
  const [ppvPrice, setPpvPrice] = useState("");
  const [ppvTeaser, setPpvTeaser] = useState(true);
  const [ppvTeaserText, setPpvTeaserText] = useState("");
  const [sendingPpv, setSendingPpv] = useState(false);
  /* Simulateur « Vue Fan » : état d'aperçu des cartes PPV du chat */
  const [fanView, setFanView] = useState<PpvState>("locked");
  const [ppvGift, setPpvGift] = useState(false);
  const [libTab, setLibTab] = useState<"galerie" | "scripts">("galerie");
  const [libFilter, setLibFilter] = useState<"all" | "Photo" | "Vidéo">("all");

  const [media, setMedia] = useState<MediaItem[]>(SEED_MEDIA);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState("250");
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<"Photo" | "Vidéo">("Photo");
  const [newSource, setNewSource] = useState<Platform>("telegram");
  const [newPrice, setNewPrice] = useState("200");
  const [newOfPrice, setNewOfPrice] = useState("20");
  const [newMymPrice, setNewMymPrice] = useState("17");
  const [savingMedia, setSavingMedia] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const mediaKey = useRef("");

  const [persona, setPersona] = useState({
    name: "Luna — assistante de vente",
    tone: "Warm & playful",
    speaks:
      "Chaleureuse, complice et jamais insistante. Elle tutoie les fans, utilise quelques emojis avec parcimonie et répond en français ou en anglais selon la langue du fan.",
    reacts:
      "Si un fan hésite sur le prix, elle rappelle la valeur du contenu et propose un aperçu. Si un fan est impoli, elle reste polie et recentre la conversation.",
    instructions:
      "Ne jamais promettre de contenu qui n'existe pas dans la Gallery. Toujours proposer le lien de déblocage en Stars. Escalader vers l'humain si le fan demande un remboursement.",
    knowledge:
      "Catalogue Gallery à jour, prix en Stars, planning des lives Q&A (jeudi 20 h), politique de remboursement sous 24 h si le contenu n'a pas été ouvert.",
  });
  const [personaSaves, setPersonaSaves] = useState(0);
  const [savingPersona, setSavingPersona] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [bcTitle, setBcTitle] = useState("");
  const [bcAudience, setBcAudience] = useState("Fans actifs (30 j)");
  const [bcMessage, setBcMessage] = useState("");
  const [savingBc, setSavingBc] = useState(false);

  const [flows, setFlows] = useState([
    { id: "f1", name: "Welcome Flow", trigger: "Nouveau fan via /start", steps: ["Message de bienvenue", "Présentation de la Gallery", "Offre découverte -20 %"], active: true },
    { id: "f2", name: "Abandoned Unlock", trigger: "Aperçu vu, pas d'achat (1 h)", steps: ["Rappel doux", "Aperçu bonus", "Prix réduit 24 h"], active: true },
    { id: "f3", name: "Post-Purchase Upsell", trigger: "Achat Gallery confirmé", steps: ["Remerciement", "Recommandation personnalisée", "Invitation au channel privé"], active: false },
    { id: "f4", name: "Reactivation 30 j", trigger: "Fan inactif depuis 30 jours", steps: ["Message de retour", "Contenu gratuit", "Offre fidélité"], active: true },
  ]);

  const [team, setTeam] = useState([
    { initials: "SL", name: "Sofia L.", role: "Owner", color: "#8b5cf6" },
    { initials: "MK", name: "Marc K.", role: "Manager", color: "#0ea5e9" },
    { initials: "AR", name: "Ana R.", role: "Support", color: "#f59e0b" },
  ]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");

  /* Integrations (tokens) — persisted in records collection "integrations" */
  const [integrations, setIntegrations] = useState<Record<Platform, IntegrationState>>({
    telegram: { token: "", username: "@atelier_prive_bot", connected: false, autoSync: false, recordId: null, lastTest: null },
    onlyfans: { token: "", username: "", connected: false, autoSync: true, recordId: null, lastTest: null },
    mym: { token: "", username: "", connected: false, autoSync: true, recordId: null, lastTest: null },
  });
  const [showToken, setShowToken] = useState<Record<Platform, boolean>>({ telegram: false, onlyfans: false, mym: false });
  const [savingInteg, setSavingInteg] = useState<Platform | null>(null);
  const integKeys = useRef<Partial<Record<Platform, string>>>({});

  /* Bots / modèles — collection « bots » */
  const [bots, setBots] = useState<BotModel[]>(SEED_BOTS);
  const [botFilter, setBotFilter] = useState<string>("all");
  const [botFormOpen, setBotFormOpen] = useState(false);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [botForm, setBotForm] = useState({ modelName: "", telegramToken: "", onlyfansKey: "", onlyfansUsername: "", mymToken: "" });
  const [savingBot, setSavingBot] = useState<string | null>(null);
  const botKey = useRef("");

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  /* Titre de l'onglet / de la page */
  useEffect(() => {
    document.title = "OmniFans.io — AI CRM & Multi-Platform";
  }, []);

  /* Load durable records on startup */
  useEffect(() => {
    (async () => {
      try {
        const [g, p, c, ig, bt] = await Promise.all([
          callApi("records.list", { collection: "gallery_items" }),
          callApi("records.list", { collection: "persona_profiles" }),
          callApi("records.list", { collection: "campaigns" }),
          callApi("records.list", { collection: "integrations" }),
          callApi("records.list", { collection: "bots" }),
        ]);
        const remoteMedia: MediaItem[] = (g?.records ?? []).map((r: any, i: number) => {
          const stars = Number(r.value.price) || 0;
          return {
            id: r.id,
            title: r.value.title ?? "Média sans titre",
            kind: r.value.kind === "Vidéo" ? "Vidéo" : "Photo",
            price: stars,
            ofPrice: Number(r.value.ofPrice) || Math.round(stars / 10),
            mymPrice: Number(r.value.mymPrice) || Math.round(stars / 12),
            source: (PLATFORMS.includes(r.value.source) ? r.value.source : "telegram") as Platform,
            sales: Number(r.value.sales) || 0,
            gradient: GRADIENTS[i % GRADIENTS.length],
            remote: true,
          };
        });
        if (remoteMedia.length) setMedia((prev) => [...remoteMedia, ...prev]);
        setPersonaSaves((p?.records ?? []).length);
        const latest = (p?.records ?? [])[0];
        if (latest?.value?.speaks) {
          setPersona((prev) => ({ ...prev, ...latest.value }));
        }
        const remoteCampaigns: Campaign[] = (c?.records ?? []).map((r: any) => ({
          id: r.id,
          title: r.value.title ?? "Campagne",
          audience: r.value.audience ?? "Tous les fans",
          status: "Brouillon",
          sent: 0,
          revenue: 0,
          when: "À l'instant",
        }));
        if (remoteCampaigns.length) setCampaigns((prev) => [...remoteCampaigns, ...prev]);
        (ig?.records ?? []).forEach((r: any) => {
          const v = r.value;
          if (!v || !PLATFORMS.includes(v.platform)) return;
          const plat = v.platform as Platform;
          setIntegrations((prev) => ({
            ...prev,
            [plat]: {
              token: typeof v.token === "string" ? v.token : "",
              username: typeof v.username === "string" && v.username ? v.username : prev[plat].username,
              connected: !!v.connected,
              autoSync: !!v.autoSync,
              recordId: r.id,
              lastTest: null,
            },
          }));
        });
        const remoteBots: BotModel[] = (bt?.records ?? []).map((r: any, i: number) => {
          const v = r.value ?? {};
          return {
            id: r.id,
            recordId: r.id,
            modelName: typeof v.model_name === "string" && v.model_name ? v.model_name : "Modèle sans nom",
            telegramToken: typeof v.telegram_token === "string" ? v.telegram_token : "",
            telegramUsername: typeof v.telegram_username === "string" ? v.telegram_username : "",
            telegramAvatarUrl: typeof v.telegram_avatar_url === "string" ? v.telegram_avatar_url : "",
            onlyfansKey: typeof v.onlyfans_key === "string" ? v.onlyfans_key : "",
            onlyfansUsername: typeof v.onlyfans_username === "string" ? v.onlyfans_username : "",
            mymToken: typeof v.mym_token === "string" ? v.mym_token : "",
            connected: !!v.is_connected,
            fansCount: Number(v.fans_count) || 0,
            fansOnline: Number(v.fans_online) || 0,
            balanceStars: Number(v.balance_stars) || 0,
            revenueToday: Number(v.revenue_today) || 0,
            gradient: GRADIENTS[i % GRADIENTS.length],
            remote: true,
          };
        });
        if (remoteBots.length) setBots(remoteBots);
        setBackend("online");
      } catch {
        setBackend("offline");
      }
    })();
  }, []);

  const activeConv = convs.find((c) => c.id === activeConvId) ?? convs[0];

  const filteredConvs = useMemo(
    () => convs.filter((c) => (c.name + c.handle + c.last).toLowerCase().includes(query.toLowerCase())),
    [convs, query]
  );
  const filteredMedia = useMemo(
    () =>
      media.filter(
        (m) =>
          m.title.toLowerCase().includes(query.toLowerCase()) &&
          (platformFilter === "all" || m.source === platformFilter)
      ),
    [media, query, platformFilter]
  );

  const inboxConvs = useMemo(
    () => filteredConvs.filter((c) => botFilter === "all" || c.botId === botFilter),
    [filteredConvs, botFilter]
  );
  const connectedBots = bots.filter((b) => b.connected);
  const fansOnlineTotal = connectedBots.reduce((a, b) => a + b.fansOnline, 0);

  const updateConv = (id: string, patch: Partial<Conv>) =>
    setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!activeConv || (!text && !attached)) return;
    const plat = activeConv.platform;
    const finalText =
      text ||
      (attached
        ? `Voici « ${attached.item.title} » en PPV — déblocage pour ${fmtPrice(attached.price, plat)} sur ${PLATFORM_META[plat].label}.`
        : "");
    const msg: Msg = {
      from: "me",
      text: finalText,
      time: "À l'instant",
      ...(attached
        ? {
            media: attached.item.title,
            ppv: {
              title: attached.item.title,
              kind: attached.item.kind,
              gradient: attached.item.gradient,
              priceLabel: fmtPrice(attached.price, plat),
              detail: attached.item.kind === "Photo" ? "1 photo" : "1 vidéo",
              state: "locked" as PpvState,
            },
          }
        : {}),
    };
    if (attached) setFanView("locked");
    updateConv(activeConv.id, {
      messages: [...activeConv.messages, msg],
      last: finalText,
      time: "À l'instant",
      unread: 0,
    });
    setChatInput("");
    setAttached(null);
  };

  /* ---------------- Vue Fan : simulateur PPV ---------------------- */
  /* Bascule toutes les cartes PPV de la conversation active dans
     l'état choisi, exactement comme le fan les verrait sur
     Telegram / OnlyFans / MYM. */
  const applyFanView = (state: PpvState) => {
    setFanView(state);
    if (!activeConv) return;
    updateConv(activeConv.id, {
      messages: activeConv.messages.map((m) =>
        m.ppv
          ? {
              ...m,
              ppv: {
                ...m.ppv,
                state,
                paidWhen: state === "unlocked" ? m.ppv.paidWhen ?? "À l'instant" : m.ppv.paidWhen,
              },
            }
          : m
      ),
    });
    showToast(
      state === "locked"
        ? "Vue Fan : PPV verrouillés — le fan voit l'aperçu flouté"
        : state === "unlocked"
          ? "Vue Fan : PPV déverrouillés — paiement simulé, contenu visible"
          : "Vue Fan : PPV offerts gratuitement — visibles immédiatement"
    );
  };

  /* Le fan clique « Débloquer » sur une carte verrouillée : paiement simulé. */
  const unlockPpvAt = (idx: number) => {
    if (!activeConv) return;
    const target = activeConv.messages[idx];
    updateConv(activeConv.id, {
      messages: activeConv.messages.map((m, i) =>
        i === idx && m.ppv ? { ...m, ppv: { ...m.ppv, state: "unlocked", paidWhen: "À l'instant" } } : m
      ),
    });
    if (target?.ppv) showToast(`Simulation : ${activeConv.name} a payé ${target.ppv.priceLabel} — contenu débloqué`);
  };

  /* Envoi d'un PPV offert gratuitement (cadeau / teaser) : aucun
     paiement, le fan voit le contenu immédiatement. */
  const sendGiftPpv = (item: MediaItem) => {
    if (!activeConv) return;
    const msg: Msg = {
      from: "me",
      text: `Cadeau gratuit envoyé : « ${item.title} » — visible immédiatement par le fan.`,
      time: "À l'instant",
      media: item.title,
      ppv: {
        title: item.title,
        kind: item.kind,
        gradient: item.gradient,
        priceLabel: "Gratuit",
        detail: item.kind === "Photo" ? "1 photo" : "1 vidéo",
        state: "free",
      },
    };
    updateConv(activeConv.id, { messages: [...activeConv.messages, msg], last: msg.text, time: "À l'instant", unread: 0 });
    setFanView("free");
    setPanel(null);
    showToast(`Cadeau « ${item.title} » envoyé gratuitement à ${activeConv.name}`);
  };

  /* Envoi PPV en live, par plateforme cible :
     - Telegram : facture Stars (sendInvoice, devise XTR) via telegram_proxy
     - OnlyFans : sendPPV via onlyfans_proxy (clé API du modèle)
     - MYM.fans : sendMessage via mym_proxy (token du modèle)
     Tout transite par fetch("/api/actions") — aucun appel direct aux plateformes. */
  const sendPpv = async (item: MediaItem, price: number, via?: Platform): Promise<boolean> => {
    if (!activeConv || sendingPpv) return false;
    const plat = via ?? activeConv.platform;

    if (plat === "telegram") {
      const bot = bots.find((b) => b.id === activeConv.botId);
      const token = (bot?.telegramToken || integrations.telegram.token).trim();
      if (!token) {
        showToast("Bot Telegram non connecté — ajoutez un bot avec son token dans Settings > Bots & Modèles");
        return false;
      }
      setSendingPpv(true);
      try {
        await telegramProxy("sendInvoice", token, {
          chat_id: activeConv.chatId,
          title: item.title,
          description: `Contenu exclusif « ${item.title} » — déblocage immédiat après paiement en Telegram Stars.`,
          payload: `ppv_${item.id}`,
          currency: "XTR",
          prices: [{ label: item.title, amount: Math.max(1, Math.round(price)) }],
        });
        const msg: Msg = {
          from: "me",
          text: `PPV envoyé: ${Math.max(1, Math.round(price))} Stars`,
          time: "À l'instant",
          media: item.title,
          ppv: {
            title: item.title,
            kind: item.kind,
            gradient: item.gradient,
            priceLabel: `${Math.max(1, Math.round(price))} Stars`,
            detail: item.kind === "Photo" ? "1 photo" : "1 vidéo",
            state: "locked",
          },
        };
        updateConv(activeConv.id, { messages: [...activeConv.messages, msg], last: msg.text, time: "À l'instant", unread: 0 });
        setFanView("locked");
        showToast(`Facture Stars envoyée à ${activeConv.name} (${Math.round(price)} Stars) via le bot`);
        return true;
      } catch (e) {
        showToast(`Envoi PPV impossible : ${e instanceof Error ? e.message : "erreur inconnue du proxy"}`);
        return false;
      } finally {
        setSendingPpv(false);
      }
    }

    /* OnlyFans / MYM : envoi live via le proxy interne de la plateforme */
    const bot = bots.find((b) => b.id === activeConv.botId);
    setSendingPpv(true);
    try {
      if (plat === "onlyfans") {
        const apiKey = (bot?.onlyfansKey || integrations.onlyfans.token).trim();
        if (!apiKey) {
          showToast("OnlyFans non connecté — ajoutez la clé API du modèle dans Settings > Bots & Modèles");
          return false;
        }
        await platformProxy("onlyfans_proxy", "sendPPV", { api_key: apiKey }, { fan_id: activeConv.handle, media_id: item.id, price });
      } else {
        const mymToken = (bot?.mymToken || integrations.mym.token).trim();
        if (!mymToken) {
          showToast("MYM.fans non connecté — ajoutez le token du modèle dans Settings > Bots & Modèles");
          return false;
        }
        await platformProxy("mym_proxy", "sendMessage", { token: mymToken }, { fan_id: activeConv.handle, media_id: item.id, price });
      }
      const priceLabel = fmtPrice(price, plat);
      const msg: Msg = {
        from: "me",
        text: `PPV envoyé en live via ${PLATFORM_META[plat].label} : « ${item.title} » — ${priceLabel}.`,
        time: "À l'instant",
        media: item.title,
        ppv: {
          title: item.title,
          kind: item.kind,
          gradient: item.gradient,
          priceLabel,
          detail: item.kind === "Photo" ? "1 photo" : "1 vidéo",
          state: "locked",
        },
      };
      updateConv(activeConv.id, { messages: [...activeConv.messages, msg], last: msg.text, time: "À l'instant", unread: 0 });
      setFanView("locked");
      showToast(`PPV « ${item.title} » envoyé en live via ${PLATFORM_META[plat].label} (${priceLabel})`);
      return true;
    } catch (e) {
      showToast(`Envoi ${PLATFORM_META[plat].label} impossible : ${e instanceof Error ? e.message : "proxy injoignable"}`);
      return false;
    } finally {
      setSendingPpv(false);
    }
  };

  /* Send PPV: price adapts to the fan's platform */
  const quickSend = (item: MediaItem) => {
    if (!activeConv) return;
    void sendPpv(item, priceFor(item, activeConv.platform));
  };

  /* ---------------- Composer toolbar handlers --------------------- */

  const insertText = (t: string) => setChatInput((prev) => (prev.trim() ? `${prev} ${t}` : t));

  const openPpv = () => {
    const first = media[0];
    setPpvId(first ? first.id : null);
    if (first) setPpvPrice(String(priceFor(first, activeConv.platform)));
    setPpvGift(false);
    setPanel("ppv");
  };

  const generateVoice = () => {
    const t = voiceText.trim();
    if (!t) {
      showToast("Écrivez d'abord le texte à vocaliser");
      return;
    }
    const msg: Msg = { from: "me", text: t, time: "À l'instant", media: `Note vocale · ${voiceStyle}` };
    updateConv(activeConv.id, {
      messages: [...activeConv.messages, msg],
      last: "Note vocale envoyée",
      time: "À l'instant",
      unread: 0,
    });
    setVoiceText("");
    setPanel(null);
    showToast("Note vocale générée et envoyée");
  };

  const saveMedia = async () => {
    const title = newTitle.trim();
    const price = parseInt(newPrice, 10);
    const ofPrice = parseFloat(newOfPrice);
    const mymPrice = parseFloat(newMymPrice);
    if (!title) {
      setFormError("Donnez un titre au média.");
      return;
    }
    if (!Number.isFinite(price) || price < 1) {
      setFormError("Le prix Telegram doit être d'au moins 1 Star.");
      return;
    }
    const ofFinal = Number.isFinite(ofPrice) && ofPrice >= 0 ? ofPrice : Math.round(price / 10);
    const mymFinal = Number.isFinite(mymPrice) && mymPrice >= 0 ? mymPrice : Math.round(price / 12);
    if (!mediaKey.current) mediaKey.current = newKey("gallery");
    setSavingMedia(true);
    setFormError(null);
    try {
      const rec = await callApi("records.create", {
        collection: "gallery_items",
        value: { title, kind: newKind, price, ofPrice: ofFinal, mymPrice: mymFinal, source: newSource, sales: 0 },
        idempotency_key: mediaKey.current,
      });
      setMedia((prev) => [
        {
          id: rec.id,
          title,
          kind: newKind,
          price,
          ofPrice: ofFinal,
          mymPrice: mymFinal,
          source: newSource,
          sales: 0,
          gradient: GRADIENTS[prev.length % GRADIENTS.length],
          remote: true,
        },
        ...prev,
      ]);
      mediaKey.current = "";
      setNewTitle("");
      setAddOpen(false);
      setBackend("online");
      showToast("Média enregistré dans la Gallery");
    } catch (e) {
      setFormError(
        e instanceof Error && e.message.includes("artifact record limit reached")
          ? "Limite de stockage atteinte (1 000 enregistrements pour l'app). Le média n'a pas été enregistré."
          : "Backend indisponible : le média n'a pas été enregistré. Réessayez une fois la connexion rétablie."
      );
    } finally {
      setSavingMedia(false);
    }
  };

  const savePersona = async () => {
    setSavingPersona(true);
    try {
      await callApi("records.create", {
        collection: "persona_profiles",
        value: { ...persona, savedAt: new Date().toISOString() },
        idempotency_key: newKey("persona"),
      });
      setPersonaSaves((n) => n + 1);
      setBackend("online");
      showToast("AI Persona enregistrée");
    } catch {
      showToast("Backend indisponible : persona non enregistrée");
    } finally {
      setSavingPersona(false);
    }
  };

  const saveCampaign = async () => {
    const title = bcTitle.trim();
    if (!title) {
      showToast("Donnez un titre à la campagne");
      return;
    }
    setSavingBc(true);
    try {
      const rec = await callApi("records.create", {
        collection: "campaigns",
        value: { title, audience: bcAudience, message: bcMessage },
        idempotency_key: newKey("campaign"),
      });
      setCampaigns((prev) => [
        { id: rec.id, title, audience: bcAudience, status: "Brouillon", sent: 0, revenue: 0, when: "À l'instant" },
        ...prev,
      ]);
      setBcTitle("");
      setBcMessage("");
      setBackend("online");
      showToast("Campagne enregistrée en brouillon");
    } catch {
      showToast("Backend indisponible : campagne non enregistrée");
    } finally {
      setSavingBc(false);
    }
  };

  /* ---------------- Integrations: connect / test / disconnect ------ */

  const updateIntegration = (p: Platform, patch: Partial<IntegrationState>) =>
    setIntegrations((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }));

  const persistIntegration = async (p: Platform, next: IntegrationState): Promise<IntegrationState> => {
    const value = {
      platform: p,
      token: next.token,
      username: next.username,
      connected: next.connected,
      autoSync: next.autoSync,
    };
    if (next.recordId) {
      await callApi("records.replace", { collection: "integrations", id: next.recordId, value });
      return next;
    }
    if (!integKeys.current[p]) integKeys.current[p] = newKey(`integ-${p}`);
    const rec = await callApi("records.create", {
      collection: "integrations",
      value,
      idempotency_key: integKeys.current[p],
    });
    return { ...next, recordId: rec.id };
  };

  const tokenFormatOk = (p: Platform, token: string) =>
    p === "telegram" ? /^\d+:[\w-]{10,}$/.test(token) : token.length >= 8;

  const connectIntegration = async (p: Platform) => {
    const st = integrations[p];
    const token = st.token.trim();
    if (!token) {
      showToast(`Collez d'abord un token ${PLATFORM_META[p].label} pour connecter`);
      return;
    }
    if (!tokenFormatOk(p, token)) {
      updateIntegration(p, { lastTest: "fail" });
      showToast(
        p === "telegram"
          ? "Format de token Telegram invalide (ex. 123456789:AAH…)"
          : "Token trop court ou invalide — vérifiez la clé copiée"
      );
      return;
    }
    setSavingInteg(p);
    try {
      let next: IntegrationState = { ...st, token, connected: true, lastTest: "ok" };
      if (p === "telegram") {
        const me = await telegramProxy("getMe", token);
        if (me?.username) next = { ...next, username: `@${me.username}` };
      }
      const saved = await persistIntegration(p, next);
      updateIntegration(p, saved);
      setBackend("online");
      showToast(
        p === "telegram"
          ? `Telegram connecté — bot ${saved.username} en ligne (LIVE)`
          : `${PLATFORM_META[p].label} connecté — token enregistré`
      );
    } catch (e) {
      if (p === "telegram") updateIntegration(p, { lastTest: "fail" });
      showToast(
        p === "telegram"
          ? `Connexion Telegram impossible : ${e instanceof Error ? e.message : "erreur inconnue"}`
          : "Backend indisponible : connexion non enregistrée"
      );
    } finally {
      setSavingInteg(null);
    }
  };

  const testIntegration = async (p: Platform) => {
    const st = integrations[p];
    const token = st.token.trim();

    if (p === "telegram") {
      if (!token) {
        updateIntegration(p, { lastTest: "fail" });
        showToast("Collez d'abord le token BotFather pour tester la connexion");
        return;
      }
      setSavingInteg(p);
      let me: any = null;
      try {
        me = await telegramProxy("getMe", token);
      } catch (e) {
        updateIntegration(p, { lastTest: "fail" });
        showToast(`Test Telegram échoué : ${e instanceof Error ? e.message : "proxy injoignable"}`);
        setSavingInteg(null);
        return;
      }
      const username = me?.username ? `@${me.username}` : st.username;
      const next: IntegrationState = { ...st, token, username, connected: true, lastTest: "ok" };
      updateIntegration(p, next);
      try {
        const saved = await persistIntegration(p, next);
        updateIntegration(p, saved);
        setBackend("online");
        showToast(`Connexion Telegram OK — bot ${username} en ligne (LIVE), token enregistré`);
      } catch {
        showToast(`Bot ${username} joignable (LIVE), mais token non enregistré : backend indisponible`);
      } finally {
        setSavingInteg(null);
      }
      return;
    }

    const ok = tokenFormatOk(p, token);
    updateIntegration(p, { lastTest: ok ? "ok" : "fail" });
    showToast(
      ok
        ? `Test réussi — le format du token ${PLATFORM_META[p].label} est valide`
        : `Test échoué — token ${PLATFORM_META[p].label} manquant ou invalide`
    );
  };

  const disconnectIntegration = async (p: Platform) => {
    const st = integrations[p];
    setSavingInteg(p);
    try {
      const saved = await persistIntegration(p, { ...st, connected: false, token: "", lastTest: null });
      updateIntegration(p, saved);
      showToast(`${PLATFORM_META[p].label} déconnecté — token supprimé`);
    } catch {
      showToast("Backend indisponible : déconnexion non enregistrée");
    } finally {
      setSavingInteg(null);
    }
  };

  const toggleAutoSync = async (p: Platform) => {
    const next = { ...integrations[p], autoSync: !integrations[p].autoSync };
    updateIntegration(p, next);
    try {
      const saved = await persistIntegration(p, next);
      updateIntegration(p, saved);
    } catch {
      showToast("Préférence affichée mais non enregistrée (backend indisponible)");
    }
  };

  /* ---------------- Bots / modèles : CRUD + connexion live -------- */

  const botValue = (b: BotModel) => ({
    model_name: b.modelName,
    telegram_token: b.telegramToken,
    telegram_username: b.telegramUsername,
    telegram_avatar_url: b.telegramAvatarUrl,
    onlyfans_key: b.onlyfansKey,
    onlyfans_username: b.onlyfansUsername,
    mym_token: b.mymToken,
    is_connected: b.connected,
    fans_count: b.fansCount,
    fans_online: b.fansOnline,
    balance_stars: b.balanceStars,
    revenue_today: b.revenueToday,
  });

  const persistBot = async (b: BotModel): Promise<BotModel> => {
    if (b.recordId) {
      await callApi("records.replace", { collection: "bots", id: b.recordId, value: botValue(b) });
      return b;
    }
    if (!botKey.current) botKey.current = newKey("bot");
    const rec = await callApi("records.create", {
      collection: "bots",
      value: botValue(b),
      idempotency_key: botKey.current,
    });
    botKey.current = "";
    return { ...b, id: rec.id, recordId: rec.id, remote: true };
  };

  const openBotForm = (b?: BotModel) => {
    if (b) {
      setEditingBotId(b.id);
      setBotForm({
        modelName: b.modelName,
        telegramToken: b.telegramToken,
        onlyfansKey: b.onlyfansKey,
        onlyfansUsername: b.onlyfansUsername,
        mymToken: b.mymToken,
      });
    } else {
      setEditingBotId(null);
      setBotForm({ modelName: "", telegramToken: "", onlyfansKey: "", onlyfansUsername: "", mymToken: "" });
      botKey.current = newKey("bot");
    }
    setBotFormOpen(true);
  };

  const saveBotForm = async () => {
    const name = botForm.modelName.trim();
    if (!name) {
      showToast("Donnez un nom au modèle / bot");
      return;
    }
    const existing = editingBotId ? bots.find((b) => b.id === editingBotId) : undefined;
    const next: BotModel = existing
      ? {
          ...existing,
          modelName: name,
          telegramToken: botForm.telegramToken.trim(),
          onlyfansKey: botForm.onlyfansKey.trim(),
          onlyfansUsername: botForm.onlyfansUsername.trim(),
          mymToken: botForm.mymToken.trim(),
        }
      : {
          id: newKey("bot"),
          recordId: null,
          modelName: name,
          telegramToken: botForm.telegramToken.trim(),
          telegramUsername: "",
          telegramAvatarUrl: "",
          onlyfansKey: botForm.onlyfansKey.trim(),
          onlyfansUsername: botForm.onlyfansUsername.trim(),
          mymToken: botForm.mymToken.trim(),
          connected: false,
          fansCount: 0,
          fansOnline: 0,
          balanceStars: 0,
          revenueToday: 0,
          gradient: GRADIENTS[bots.length % GRADIENTS.length],
        };
    setBots((prev) => (existing ? prev.map((b) => (b.id === next.id ? next : b)) : [next, ...prev]));
    setBotFormOpen(false);
    setSavingBot(next.id);
    try {
      const saved = await persistBot(next);
      setBots((prev) => prev.map((b) => (b.id === next.id ? saved : b)));
      setBackend("online");
      showToast(existing ? `Bot « ${name} » mis à jour` : `Bot « ${name} » ajouté — cliquez « Connecter » pour le passer LIVE`);
    } catch {
      showToast("Backend indisponible : bot affiché localement, non enregistré");
    } finally {
      setSavingBot(null);
    }
  };

  /* Connexion live d'un bot : getMe puis getUserProfilePhotos via le
     proxy interne pour récupérer la vraie photo de profil du bot. */
  const connectBot = async (b: BotModel) => {
    const token = b.telegramToken.trim();
    if (!token) {
      showToast(`Ajoutez d'abord le token Telegram de ${b.modelName} (édition de la carte)`);
      return;
    }
    setSavingBot(b.id);
    try {
      const me = await telegramProxy("getMe", token);
      let avatarUrl = b.telegramAvatarUrl;
      try {
        const photos = await telegramProxy("getUserProfilePhotos", token, { user_id: me?.id });
        const direct = photos?.avatar_url || photos?.photos?.[0]?.[0]?.url;
        if (typeof direct === "string" && direct) {
          avatarUrl = direct;
        } else {
          const fileId = photos?.photos?.[0]?.[0]?.file_id;
          if (fileId) {
            const f = await telegramProxy("getFile", token, { file_id: fileId });
            if (typeof f?.url === "string" && f.url) avatarUrl = f.url;
            else if (typeof f?.avatar_url === "string" && f.avatar_url) avatarUrl = f.avatar_url;
          }
        }
      } catch {
        /* Photo de profil optionnelle : on garde l'initiale dégradée. */
      }
      const next: BotModel = {
        ...b,
        telegramToken: token,
        telegramUsername: me?.username ? `@${me.username}` : b.telegramUsername,
        telegramAvatarUrl: avatarUrl,
        connected: true,
      };
      setBots((prev) => prev.map((x) => (x.id === b.id ? next : x)));
      try {
        const saved = await persistBot(next);
        setBots((prev) => prev.map((x) => (x.id === b.id ? saved : x)));
        setBackend("online");
        showToast(`${b.modelName} est LIVE — bot ${next.telegramUsername} connecté${avatarUrl ? ", photo de profil récupérée" : ""}`);
      } catch {
        showToast(`Bot ${next.telegramUsername} joignable (LIVE) — enregistrement backend indisponible`);
      }
    } catch (e) {
      showToast(`Connexion de ${b.modelName} impossible : ${e instanceof Error ? e.message : "proxy injoignable"}`);
    } finally {
      setSavingBot(null);
    }
  };

  const disconnectBot = async (b: BotModel) => {
    const next = { ...b, connected: false };
    setBots((prev) => prev.map((x) => (x.id === b.id ? next : x)));
    setSavingBot(b.id);
    try {
      const saved = await persistBot(next);
      setBots((prev) => prev.map((x) => (x.id === b.id ? saved : x)));
      showToast(`${b.modelName} déconnecté`);
    } catch {
      showToast("Déconnexion affichée localement (backend indisponible)");
    } finally {
      setSavingBot(null);
    }
  };

  const deleteBot = async (b: BotModel) => {
    setBots((prev) => prev.filter((x) => x.id !== b.id));
    if (botFilter === b.id) setBotFilter("all");
    if (editingBotId === b.id) setBotFormOpen(false);
    if (b.recordId) {
      try {
        await callApi("records.delete", { collection: "bots", id: b.recordId });
        showToast(`Bot « ${b.modelName} » supprimé`);
      } catch {
        showToast("Bot retiré localement — suppression backend indisponible");
      }
    } else {
      showToast(`Bot « ${b.modelName} » supprimé`);
    }
  };

  const applyBulkPrice = () => {
    const price = parseInt(bulkPrice, 10);
    if (!Number.isFinite(price) || price < 1 || selected.length === 0) return;
    setMedia((prev) => prev.map((m) => (selected.includes(m.id) ? { ...m, price } : m)));
    showToast(`Prix Telegram mis à jour pour ${selected.length} média(s)`);
    setSelected([]);
  };

  const copyText = (text: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("Lien copié dans le presse-papiers");
    } catch {
      showToast("Copie impossible dans cet aperçu");
    }
    document.body.removeChild(ta);
  };

  const pageTitle: Record<Page, { title: string; sub: string }> = {
    dashboard: { title: "Dashboard", sub: "Vue d'ensemble de votre business Telegram, OnlyFans et MYM avec OmniFans.io" },
    live: { title: "Live Models", sub: "Bots connectés et fans en ligne, en temps réel" },
    inbox: { title: "Fan Inbox", sub: "Conversations fans Telegram, OnlyFans et MYM" },
    gallery: { title: "Gallery", sub: "Vos contenus, prix par plateforme" },
    persona: { title: "AI Persona", sub: "Personnalité, ton et garde-fous de votre chatbot" },
    broadcast: { title: "Broadcast", sub: "Messages de masse vers vos fans" },
    flows: { title: "Flows", sub: "Automatisations du bot et du channel" },
    stats: { title: "Statistics", sub: "Revenus, conversion et tracking links" },
    settings: { title: "Settings", sub: "Workspace, équipe, abonnement & intégrations" },
  };

  /* ---------------------------------------------------------------- */
  /*  Integration card (Settings)                                      */
  /* ---------------------------------------------------------------- */

  const renderIntegrationCard = (p: Platform) => {
    const cfg = INTEGRATION_CONFIG[p];
    const st = integrations[p];
    const stats = INTEGRATION_STATS[p];
    const Icon = cfg.icon;
    const saving = savingInteg === p;
    return (
      <Card key={p} className="flex flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ background: PLATFORM_META[p].color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold leading-tight">{cfg.title}</h3>
              <p className="text-[11px] text-[var(--muted)]">{PLATFORM_META[p].label}</p>
            </div>
          </div>
          {st.connected ? (
            p === "telegram" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--good)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white pulse-dot" /> Live
              </span>
            ) : (
              <Chip tone="good">
                <BadgeCheck className="h-3 w-3" /> Connected
              </Chip>
            )
          ) : (
            <Chip>Disconnected</Chip>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">{cfg.blurb}</p>

        {p === "onlyfans" && (
          <div className="mt-4">
            <label className={labelCls} htmlFor="of-user">Nom d'utilisateur OnlyFans</label>
            <input
              id="of-user"
              value={st.username}
              onChange={(e) => updateIntegration(p, { username: e.target.value })}
              placeholder="@votre_pseudo"
              className={inputCls}
              autoComplete="off"
            />
          </div>
        )}

        <div className="mt-4">
          <label className={labelCls} htmlFor={`tok-${p}`}>{cfg.tokenLabel}</label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id={`tok-${p}`}
              type={showToken[p] ? "text" : "password"}
              value={st.token}
              onChange={(e) => updateIntegration(p, { token: e.target.value, lastTest: null })}
              placeholder={cfg.placeholder}
              className={`${inputCls} mono pl-9 pr-10 text-[13px]`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowToken((prev) => ({ ...prev, [p]: !prev[p] }))}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)]"
              aria-label={showToken[p] ? "Masquer le token" : "Afficher le token"}
            >
              {showToken[p] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">{cfg.help}</p>
          {st.lastTest && (
            <p className={`mt-1.5 text-[11px] font-semibold ${st.lastTest === "ok" ? "text-[var(--good)]" : "text-[var(--warn)]"}`}>
              Dernier test : {st.lastTest === "ok" ? (p === "telegram" ? `bot ${st.username} joignable — getMe OK via le proxy interne` : "format valide, prêt à connecter") : "échec — vérifiez le token"}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {st.connected ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => disconnectIntegration(p)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" /> {saving ? "…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => connectIntegration(p)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              <PlugZap className="h-3.5 w-3.5" /> {saving ? "Connexion…" : p === "telegram" ? "Connect Bot" : "Connect"}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => testIntegration(p)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {saving ? "Test en cours…" : "Tester la connexion"}
          </button>
        </div>

        {(p === "onlyfans" || p === "mym") && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold">{p === "onlyfans" ? "Auto-sync gallery from OnlyFans" : "Auto-sync MYM"}</p>
              <p className="text-[11px] text-[var(--muted)]">Nouveaux médias et prix importés automatiquement</p>
            </div>
            <Toggle small on={st.autoSync} onClick={() => toggleAutoSync(p)} />
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-4 text-sm">
          {p === "telegram" ? (
            <>
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Bot username</p>
                <p className="mt-0.5 truncate font-semibold">{st.connected ? st.username || "@atelier_prive_bot" : "—"}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Bot balance</p>
                <p className="mono mt-0.5 font-semibold">{st.connected ? stats.balanceLabel : "0 Stars"}</p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Subscribers</p>
                <p className="mono mt-0.5 font-semibold">{st.connected ? fmt(stats.subscribers) : "—"}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Earnings</p>
                <p className="mono mt-0.5 font-semibold">{st.connected ? stats.earningsLabel : "—"}</p>
              </div>
            </>
          )}
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          Statut : {st.connected ? <span className="font-semibold text-[var(--good)]">Connected{p === "telegram" ? " · LIVE" : ""}</span> : "Disconnected"} · token conservé dans les enregistrements de l'app (collection « integrations »).
        </p>
      </Card>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Pages                                                            */
  /* ---------------------------------------------------------------- */

  const DashboardPage = (
    <div className="space-y-5">
      {/* Official product reference */}
      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <a
          href="https://app.telestars.io/dashboard"
          target="_blank"
          rel="noopener"
          aria-label="Telestars - AI chatbot & CRM to sell content in Stars"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90"
        >
          <Star className="h-5 w-5" fill="currentColor" />
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Produit de référence — catalogue #1</p>
          <a
            href="https://app.telestars.io/dashboard"
            target="_blank"
            rel="noopener"
            className="block text-sm font-semibold text-[var(--accent-strong)] hover:underline"
          >
            Telestars - AI chatbot &amp; CRM to sell content in Stars
          </a>
        </div>
        <a
          href="https://app.telestars.io/dashboard"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-2)]"
        >
          Ouvrir l'app officielle <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </Card>

      {/* Live Models strip */}
      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex -space-x-2">
          {connectedBots.slice(0, 4).map((b) => (
            <span key={b.id} className="ring-2 ring-[var(--surface)] rounded-full">
              <LiveAvatar name={b.modelName} src={b.telegramAvatarUrl} gradient={b.gradient} size="sm" live />
            </span>
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--good)]" />
            Live Models — {connectedBots.length} bot{connectedBots.length > 1 ? "s" : ""} en ligne
          </p>
          <p className="truncate text-xs text-[var(--muted)]">
            {fansOnlineTotal} fans connectés en ce moment · {fmt(connectedBots.reduce((a, b) => a + b.revenueToday, 0))} Stars gagnés aujourd'hui
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPage("live")}
          className="inline-flex items-center gap-1 rounded-lg bg-[var(--good)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <Radio className="h-3.5 w-3.5" /> Voir qui est connecté
        </button>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Total Stars", value: "11,590", delta: "+12,5 % vs sem. dernière", icon: Star, accent: true },
          { label: "Revenue USD", value: "$150.67", delta: "≈ 0,013 $ / Star", icon: DollarSign },
          { label: "Conversations actives", value: "47", delta: "12 en cours avec l'IA", icon: MessageCircle },
          { label: "Sales today", value: "+150", delta: "Stars depuis minuit", icon: TrendingUp },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{s.label}</p>
              <s.icon className={`h-4 w-4 ${s.accent ? "text-[var(--accent)]" : "text-[var(--muted)]"}`} fill={s.accent ? "currentColor" : "none"} />
            </div>
            <p className="mono mt-2 text-[26px] font-bold leading-none">{s.value}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{s.delta}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Chart */}
        <Card className="p-4 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Sales — 7 derniers jours</h3>
              <p className="text-xs text-[var(--muted)]">Stars vendus via le bot et le channel</p>
            </div>
            <Chip tone="good">
              <TrendingUp className="h-3 w-3" /> +18,2 %
            </Chip>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={SALES_7D} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
                <defs>
                  <linearGradient id="starsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: any, name: string) => [name === "stars" ? `${fmt(Number(v))} Stars` : `$${v}`, name === "stars" ? "Stars" : "USD"]}
                />
                <Area type="monotone" dataKey="stars" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#starsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* AI status */}
        <Card className="flex flex-col p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4 text-[var(--accent)]" /> AI Sales Agent
            </h3>
            <Toggle on={aiOn} onClick={() => { setAiOn(!aiOn); showToast(aiOn ? "IA mise en pause globale" : "IA réactivée"); }} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${aiOn ? "bg-[var(--good)] pulse-dot" : "bg-[var(--warn)]"}`} />
            <span className="text-sm font-medium">{aiOn ? "Active — répond aux fans" : "En pause — mode manuel"}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Persona « {persona.name} » · ton {persona.tone.toLowerCase()}. L'IA a géré 38 conversations et clos 14 ventes cette semaine.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2">
              <span className="text-[var(--muted)]">Réponse moyenne</span>
              <span className="mono font-semibold">8 s</span>
            </div>
            <div className="flex justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2">
              <span className="text-[var(--muted)]">Taux de conversion</span>
              <span className="mono font-semibold">23,6 %</span>
            </div>
            <div className="flex justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2">
              <span className="text-[var(--muted)]">Escalades humaines</span>
              <span className="mono font-semibold">3</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPage("persona")}
            className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
          >
            Configurer la persona <ChevronRight className="h-4 w-4" />
          </button>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Revenue Sources */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Revenue Sources</h3>
            <div className="flex rounded-xl bg-[var(--surface-2)] p-1" role="group" aria-label="Vue des revenus">
              {(
                [
                  ["donut", "Donut"],
                  ["details", "Par plateforme"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRevView(v)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    revView === v ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Total earnings (30 j)</p>
          <p className="mono text-[26px] font-bold leading-tight">{fmtUSD(REVENUE_TOTAL)}</p>

          {revView === "donut" ? (
            <>
              <div className="relative mx-auto h-[190px] w-full max-w-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={REVENUE_SOURCES} dataKey="usd" nameKey="label" innerRadius={58} outerRadius={84} paddingAngle={3} strokeWidth={0}>
                      {REVENUE_SOURCES.map((s) => (
                        <Cell key={s.platform} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
                      formatter={(v: any, name: string) => [fmtUSD(Number(v)), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Total</span>
                  <span className="mono text-base font-bold">{fmtUSD(REVENUE_TOTAL)}</span>
                </div>
              </div>
              <ul className="mt-2 space-y-2">
                {REVENUE_SOURCES.map((s) => (
                  <li key={s.platform} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 font-medium">{s.label}</span>
                    <span className="mono text-xs text-[var(--muted)]">{s.display}</span>
                    <span className="mono w-12 text-right text-xs font-semibold">{((s.usd / REVENUE_TOTAL) * 100).toFixed(1)} %</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="mt-3 space-y-3">
              {REVENUE_SOURCES.map((s) => {
                const share = (s.usd / REVENUE_TOTAL) * 100;
                const connected = integrations[s.platform].connected;
                return (
                  <li key={s.platform}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1 font-medium">{s.label}</span>
                      <span className="mono text-xs font-semibold">{fmtUSD(s.usd)}</span>
                      <span className="mono text-xs text-[var(--muted)]">{share.toFixed(1)} %</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: s.color }} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--muted)]">{s.display} sur 30 j</span>
                      {connected ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--good)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" /> Connecté
                        </span>
                      ) : (
                        <button type="button" onClick={() => setPage("settings")} className="font-semibold text-[var(--accent-strong)] hover:underline">
                          Connecter →
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Recent sales */}
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h3 className="text-sm font-semibold">Recent sales</h3>
            <button type="button" onClick={() => setPage("stats")} className="text-xs font-semibold text-[var(--accent-strong)] hover:underline">
              Tout voir
            </button>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {RECENT_SALES.map((s) => (
              <li key={s.fan + s.item} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <Star className="h-4 w-4" fill="currentColor" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.item}</p>
                  <p className="text-xs text-[var(--muted)]">{s.fan} · {s.time}</p>
                </div>
                <span className="mono text-sm font-semibold">+{s.stars} Stars</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );

  const InboxPage = (
    <div className="rise grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_280px]">
      {/* Conversation list */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{inboxConvs.length} conversations</p>
          {/* Sélecteur de bot / modèle */}
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par bot / modèle">
            <button
              type="button"
              onClick={() => setBotFilter("all")}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                botFilter === "all" ? "bg-[#0a0a0a] text-white dark:bg-white dark:text-black" : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--surface-3)]"
              }`}
            >
              Tous les modèles
            </button>
            {bots.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBotFilter(b.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  botFilter === b.id ? "bg-[#0a0a0a] text-white dark:bg-white dark:text-black" : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--surface-3)]"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${b.connected ? "bg-[var(--good)]" : "bg-[var(--muted)]"}`} />
                {b.modelName}
              </button>
            ))}
          </div>
        </div>
        <ul className="max-h-[540px] divide-y divide-[var(--line)] overflow-y-auto">
          {inboxConvs.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => { setActiveConvId(c.id); updateConv(c.id, { unread: 0 }); setAttached(null); setPanel(null); }}
                className={`flex w-full items-start gap-2.5 px-3 py-3 text-left transition-colors ${
                  c.id === activeConvId ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                <Avatar initials={c.initials} color={c.color} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">{c.time}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{c.last}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <PlatformBadge platform={c.platform} withLabel={false} />
                    {c.aiPaused ? <Chip tone="warn"><Pause className="h-3 w-3" /> AI paused</Chip> : <Chip tone="good"><Bot className="h-3 w-3" /> AI active</Chip>}
                    {c.unread > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">{c.unread}</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {inboxConvs.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">Aucune conversation pour ce modèle / ce filtre.</li>}
        </ul>
      </Card>

      {/* Chat */}
      <Card className="flex min-h-[540px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <Avatar initials={activeConv.initials} color={activeConv.color} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{activeConv.name} <span className="font-normal text-[var(--muted)]">{activeConv.handle}</span></p>
            <p className="text-xs text-[var(--muted)]">{activeConv.aiPaused ? "Vous avez pris le contrôle" : "L'IA répond automatiquement"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              updateConv(activeConv.id, { aiPaused: !activeConv.aiPaused });
              showToast(activeConv.aiPaused ? `IA réactivée pour ${activeConv.name}` : `Contrôle manuel : IA en pause pour ${activeConv.name}`);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
              activeConv.aiPaused
                ? "bg-[var(--good)] text-white hover:opacity-90"
                : "bg-[var(--warn-soft)] text-[var(--warn)] hover:opacity-90"
            }`}
          >
            {activeConv.aiPaused ? <><Play className="h-3.5 w-3.5" /> Resume AI</> : <><Pause className="h-3.5 w-3.5" /> Pause AI — prendre le contrôle</>}
          </button>
        </div>

        {/* Simulateur Vue Fan : prévisualiser le PPV comme le fan le voit */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <Eye className="h-3.5 w-3.5" /> Vue Fan
          </span>
          <div className="flex rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-0.5" role="group" aria-label="Simuler la vue du fan">
            {(
              [
                ["locked", "Verrouillé", Lock],
                ["unlocked", "Déverrouillé", LockOpen],
                ["free", "Gratuit", Gift],
              ] as const
            ).map(([s, label, Icon]) => (
              <button
                key={s}
                type="button"
                onClick={() => applyFanView(s)}
                aria-pressed={fanView === s}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  fanView === s
                    ? s === "locked"
                      ? "bg-[#8b5cf6] text-white"
                      : s === "unlocked"
                        ? "bg-[var(--good)] text-white"
                        : "bg-sky-500 text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <span className="hidden text-[11px] text-[var(--muted)] sm:block">
            Voici ce que {activeConv.name} voit dans son app {PLATFORM_META[activeConv.platform].label}
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--surface-2)] px-4 py-4">
          {activeConv.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "fan" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                  m.from === "fan"
                    ? "rounded-bl-md bg-[var(--surface)] text-[var(--ink)]"
                    : m.from === "ai"
                      ? "rounded-br-md bg-[var(--accent)] text-white"
                      : "rounded-br-md bg-[#0a0a0a] text-white"
                }`}
              >
                {m.from !== "fan" && (
                  <p className={`mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${m.from === "ai" ? "text-white/80" : "text-white/60"}`}>
                    {m.from === "ai" ? <><Bot className="h-3 w-3" /> IA</> : "Vous"}
                  </p>
                )}
                {m.ppv ? (
                  <div className="mb-2">
                    <p className={`mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${m.from === "fan" ? "text-[var(--muted)]" : "text-white/70"}`}>
                      <Eye className="h-3 w-3" /> Aperçu — ce que voit le fan
                    </p>
                    <div
                      className={`w-[228px] overflow-hidden rounded-2xl bg-[var(--surface)] text-left text-[var(--ink)] shadow-md ${
                        m.ppv.state === "unlocked"
                          ? "border-2 border-[var(--good)]"
                          : m.ppv.state === "free"
                            ? "border-2 border-sky-500"
                            : "border border-black/20"
                      }`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <div
                          className={`absolute inset-0 flex items-center justify-center text-white/90 ${m.ppv.state === "locked" ? "scale-125 blur-[20px]" : ""}`}
                          style={{ background: m.ppv.gradient }}
                        >
                          {m.ppv.kind === "Vidéo" ? <Video className="h-10 w-10" /> : <Images className="h-10 w-10" />}
                        </div>
                        {m.ppv.state === "locked" && (
                          <>
                            <div className="absolute inset-0 bg-black/60" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white">
                              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                                <Lock className="h-6 w-6" />
                              </span>
                              <span className="text-[13px] font-bold">Contenu verrouillé</span>
                              <span className="text-[11px] text-white/75">{m.ppv.detail}</span>
                            </div>
                          </>
                        )}
                        {m.ppv.state === "unlocked" && (
                          <>
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--good)] px-2 py-0.5 text-[10px] font-bold text-white shadow">
                              <Check className="h-3 w-3" /> Débloqué
                            </span>
                            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                              <LockOpen className="h-3.5 w-3.5" />
                            </span>
                          </>
                        )}
                        {m.ppv.state === "free" && (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                            <Gift className="h-3 w-3" /> Gratuit
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-bold">{m.ppv.title}</p>
                        {m.ppv.state === "locked" && (
                          <>
                            <button
                              type="button"
                              onClick={() => unlockPpvAt(i)}
                              className="pulse-violet mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#8b5cf6] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#7c3aed]"
                            >
                              <LockOpen className="h-3.5 w-3.5" /> Débloquer pour {m.ppv.priceLabel}
                            </button>
                            <p className="mt-1.5 text-center text-[10px] text-[var(--muted)]">
                              {m.ppv.detail} · paiement {activeConv.platform === "telegram" ? "Telegram Stars" : PLATFORM_META[activeConv.platform].label}
                            </p>
                          </>
                        )}
                        {m.ppv.state === "unlocked" && (
                          <>
                            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--good)]">
                              <Check className="h-3.5 w-3.5" /> Payé {m.ppv.priceLabel} · {m.ppv.paidWhen ?? "À l'instant"}
                            </p>
                            <span className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--good-soft)] px-3 py-2 text-xs font-bold text-[var(--good)]">
                              <LockOpen className="h-3.5 w-3.5" /> Contenu débloqué
                            </span>
                          </>
                        )}
                        {m.ppv.state === "free" && (
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-sky-600">
                            <Gift className="h-3.5 w-3.5" /> Cadeau pour toi 😘 — visible immédiatement
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  m.media && (
                    <span className="mb-2 flex items-center gap-2 rounded-lg bg-black/15 px-2.5 py-2 text-xs font-medium">
                      <Lock className="h-3.5 w-3.5" /> {m.media} · contenu verrouillé
                    </span>
                  )
                )}
                <p>{m.text}</p>
                <p className={`mt-1 text-right text-[10px] ${m.from === "fan" ? "text-[var(--muted)]" : "text-white/70"}`}>{m.time}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--line)] bg-[var(--surface)] px-3 py-3">
          {attached && (
            <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2">
              <span className="relative h-10 w-12 shrink-0 overflow-hidden rounded-lg" style={{ background: attached.item.gradient }}>
                <span className="absolute inset-0 flex items-center justify-center text-white/90">
                  {attached.item.kind === "Vidéo" ? <Video className="h-4 w-4" /> : <Images className="h-4 w-4" />}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{attached.item.title}</span>
                <span className="block text-[11px] text-[var(--muted)]">PPV attaché au message — prêt à envoyer</span>
              </span>
              <span className="mono inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-1 text-[11px] font-bold text-white">
                {activeConv.platform === "telegram" && <Star className="h-3 w-3" fill="currentColor" />}
                {fmtPrice(attached.price, activeConv.platform)}
              </span>
              <button
                type="button"
                onClick={() => setAttached(null)}
                aria-label="Retirer le média attaché"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-3)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
              placeholder="Écrivez un message..."
              aria-label="Écrivez un message"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={sendMessage}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
              aria-label="Envoyer le message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {/* Barre d'outils façon OmniFans */}
          <div className="relative mt-2.5 flex items-center gap-2" role="toolbar" aria-label="Outils du message">
            {(
              [
                { key: "voice", label: "Générer une note vocale", Icon: Mic, onClick: () => setPanel(panel === "voice" ? null : "voice") },
                { key: "favs", label: "Messages favoris", Icon: Star, onClick: () => setPanel(panel === "favs" ? null : "favs") },
                { key: "ppv", label: "Envoyer PPV", Icon: DollarSign, onClick: () => (panel === "ppv" ? setPanel(null) : openPpv()) },
                { key: "emoji", label: "Émoji", Icon: Smile, onClick: () => setPanel(panel === "emoji" ? null : "emoji") },
                { key: "library", label: "Galerie", Icon: FileText, onClick: () => { setLibTab("galerie"); setPanel(panel === "library" ? null : "library"); } },
              ] as const
            ).map(({ key, label, Icon, onClick }) => (
              <div key={key} className="group relative">
                <button
                  type="button"
                  onClick={onClick}
                  aria-label={label}
                  aria-pressed={panel === key}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-[var(--surface)] text-[var(--ink)] transition-colors ${
                    panel === key ? "border-[var(--ink)]" : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </button>
                <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#0a0a0a] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-white dark:text-black">
                  {label}
                </span>
              </div>
            ))}
            <span className="ml-1 hidden text-[11px] text-[var(--muted)] sm:block">
              {activeConv.aiPaused ? "Mode manuel — vous écrivez" : "L'IA peut aussi répondre seule"}
            </span>

            {panel === "emoji" && (
              <div className="absolute bottom-full left-0 z-30 mb-2 w-[268px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow)]">
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Émoji</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertText(e)}
                      aria-label={`Insérer l'émoji ${e}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-[var(--surface-2)]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {panel === "favs" && (
              <div className="absolute bottom-full left-0 z-30 mb-2 w-[300px] max-w-[78vw] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow)]">
                <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <Star className="h-3.5 w-3.5 text-[var(--accent)]" fill="currentColor" /> Messages favoris · Quick replies
                </p>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {QUICK_REPLIES.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => { insertText(q); setPanel(null); }}
                        className="w-full rounded-xl px-2.5 py-2 text-left text-[13px] leading-snug hover:bg-[var(--surface-2)]"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Fan details */}
      <Card className="h-fit p-4">
        <div className="flex flex-col items-center text-center">
          <span className="relative">
            <Avatar initials={activeConv.initials} color={activeConv.color} size="lg" />
            <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-[var(--good)] ring-2 ring-[var(--surface)]" title="Fan connecté" />
          </span>
          <p className="mt-2 text-sm font-semibold">{activeConv.name}</p>
          <p className="text-xs text-[var(--muted)]">{activeConv.handle}</p>
          <span className="mt-2">
            <PlatformBadge platform={activeConv.platform} />
          </span>
        </div>
        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-[var(--muted)]">Plateforme</dt>
            <dd><PlatformBadge platform={activeConv.platform} /></dd>
          </div>
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Total dépensé</dt><dd className="mono font-semibold">{fmt(activeConv.spent)} Stars</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Fan depuis</dt><dd className="font-medium">{activeConv.joined}</dd></div>
          <div className="flex justify-between"><dt className="text-[var(--muted)]">Source</dt><dd className="text-right font-medium">{activeConv.source}</dd></div>
          {activeConv.platform === "telegram" && (
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Chat ID Telegram</dt><dd className="mono font-semibold">{activeConv.chatId}</dd></div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-[var(--muted)]">Statut IA</dt>
            <dd>{activeConv.aiPaused ? <Chip tone="warn">AI paused</Chip> : <Chip tone="good">AI active</Chip>}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">Bot / modèle</span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              {(() => {
                const b = bots.find((x) => x.id === activeConv.botId);
                return b ? (
                  <>
                    <LiveAvatar name={b.modelName} src={b.telegramAvatarUrl} gradient={b.gradient} size="sm" live={b.connected} />
                    {b.modelName}
                  </>
                ) : (
                  "—"
                );
              })()}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-sm">
            <span className="text-[var(--muted)]">Abonnement</span>
            {activeConv.spent > 0 ? (
              <Chip tone="good"><BadgeCheck className="h-3 w-3" /> Abonné payant</Chip>
            ) : (
              <Chip>Fan gratuit</Chip>
            )}
          </div>
          <p className={`${labelCls} mt-4`}>Historique des dépenses</p>
          {(() => {
            const purchases = RECENT_SALES.filter((s) => s.fan === activeConv.name);
            if (purchases.length === 0) {
              return (
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Aucun achat récent listé — total dépensé à ce jour : {fmt(activeConv.spent)} Stars via les PPV débloqués.
                </p>
              );
            }
            return (
              <ul className="space-y-1.5">
                {purchases.map((s) => (
                  <li key={s.item} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-2)] px-2.5 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.item}</span>
                      <span className="text-[var(--muted)]">{s.time}</span>
                    </span>
                    <span className="mono shrink-0 font-bold">+{s.stars} Stars</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <p className={labelCls}>Statut des PPV envoyés</p>
          {(() => {
            const ppvs = activeConv.messages.filter((m) => m.ppv);
            if (ppvs.length === 0)
              return (
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Aucun PPV envoyé dans cette conversation. Utilisez « Envoyer PPV » sous le champ de message.
                </p>
              );
            return (
              <ul className="space-y-1.5">
                {ppvs.map((m, idx) => (
                  <li key={idx} className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2 text-xs">
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{m.ppv!.title}</span>
                      {m.ppv!.state === "locked" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#8b5cf6] px-2 py-0.5 text-[10px] font-bold text-white">
                          <Lock className="h-3 w-3" /> Verrouillé
                        </span>
                      )}
                      {m.ppv!.state === "unlocked" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--good)] px-2 py-0.5 text-[10px] font-bold text-white">
                          <Check className="h-3 w-3" /> Payé
                        </span>
                      )}
                      {m.ppv!.state === "free" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          <Gift className="h-3 w-3" /> Gratuit
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-[var(--muted)]">
                      {m.ppv!.state === "free" ? "Offert gratuitement" : `Prix : ${m.ppv!.priceLabel}`} · Envoyé {m.time}
                      {m.ppv!.state === "locked" && " · en attente de paiement"}
                      {m.ppv!.state === "unlocked" && ` · Payé ${m.ppv!.priceLabel} · ${m.ppv!.paidWhen ?? m.time}`}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="mt-2 text-[11px] text-[var(--muted)]">Basculez l'aperçu avec « Vue Fan » en haut du chat pour simuler le paiement.</p>
        </div>
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <label className={labelCls} htmlFor="unlock">Unlock price (Stars)</label>
          <div className="flex items-center gap-2">
            <input
              id="unlock"
              type="number"
              min={1}
              value={activeConv.unlockPrice}
              onChange={(e) => updateConv(activeConv.id, { unlockPrice: parseInt(e.target.value, 10) || 0 })}
              className={`${inputCls} mono`}
            />
            <Star className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="currentColor" />
          </div>
        </div>
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <p className={labelCls}>Send PPV — prix {PLATFORM_META[activeConv.platform].label}</p>
          <p className="-mt-1 mb-2 text-[11px] text-[var(--muted)]">
            Le prix s'adapte à la plateforme du fan : {activeConv.platform === "telegram" ? "Stars" : activeConv.platform === "onlyfans" ? "USD ($)" : "EUR (€)"}.
          </p>
          <div className="space-y-2">
            {media.slice(0, 4).map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={sendingPpv}
                onClick={() => quickSend(m)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] px-2.5 py-2 text-left hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                <span className="h-9 w-9 shrink-0 rounded-lg" style={{ background: m.gradient }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{m.title}</span>
                  <span className="mono text-[11px] text-[var(--muted)]">{fmtPrice(priceFor(m, activeConv.platform), activeConv.platform)}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent)] px-2 py-1 text-[11px] font-semibold text-white">
                  <Send className="h-3 w-3" /> PPV
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );

  const GalleryPage = (
    <div className="rise space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setAddOpen(!addOpen); setFormError(null); mediaKey.current = newKey("gallery"); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0a0a0a] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-85 dark:bg-white dark:text-black"
        >
          <Plus className="h-4 w-4" /> Add media
        </button>
        <span className="text-xs text-[var(--muted)]">L'ajout de fichiers n'est pas encore disponible : créez une fiche média (titre + prix par plateforme), le fichier se rattache depuis Telegram, OnlyFans ou MYM.</span>
        {selected.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[var(--muted)]">{selected.length} sélectionné(s)</span>
            <input type="number" min={1} value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} className="mono w-24 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-sm" aria-label="Nouveau prix Telegram en Stars" />
            <span className="text-xs text-[var(--muted)]">Stars</span>
            <button type="button" onClick={applyBulkPrice} className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]">
              Set price
            </button>
            <button type="button" onClick={() => setSelected([])} className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--surface-2)]">
              Effacer
            </button>
          </span>
        )}
      </div>

      {/* Platform filter */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par plateforme">
        {(
          [
            ["all", "Toutes"],
            ["telegram", "Telegram"],
            ["onlyfans", "OnlyFans"],
            ["mym", "MYM.fans"],
          ] as const
        ).map(([f, label]) => {
          const count = f === "all" ? media.length : media.filter((m) => m.source === f).length;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setPlatformFilter(f)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                platformFilter === f ? "bg-[#0a0a0a] text-white dark:bg-white dark:text-black" : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--surface-3)]"
              }`}
            >
              {f !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_META[f as Platform].color }} />}
              {label}
              <span className="mono text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {addOpen && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Nouveau média</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="nt">Titre</label>
              <input id="nt" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex. Studio Session — Pack 8" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="nk">Type</label>
              <select id="nk" value={newKind} onChange={(e) => setNewKind(e.target.value as "Photo" | "Vidéo")} className={inputCls}>
                <option>Photo</option>
                <option>Vidéo</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ns">Plateforme source</label>
              <select id="ns" value={newSource} onChange={(e) => setNewSource(e.target.value as Platform)} className={inputCls}>
                <option value="telegram">Telegram</option>
                <option value="onlyfans">OnlyFans</option>
                <option value="mym">MYM.fans</option>
              </select>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="np">Prix Telegram (Stars)</label>
              <input id="np" type="number" min={1} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className={`${inputCls} mono`} />
            </div>
            <div>
              <label className={labelCls} htmlFor="nof">Prix OnlyFans ($)</label>
              <input id="nof" type="number" min={0} step="0.5" value={newOfPrice} onChange={(e) => setNewOfPrice(e.target.value)} className={`${inputCls} mono`} />
            </div>
            <div>
              <label className={labelCls} htmlFor="nmy">Prix MYM (€)</label>
              <input id="nmy" type="number" min={0} step="0.5" value={newMymPrice} onChange={(e) => setNewMymPrice(e.target.value)} className={`${inputCls} mono`} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">Exemple : 150 Stars (Telegram) / $15 (OnlyFans) / €12 (MYM). Chaque plateforme facture dans sa devise.</p>
          {formError && <p className="mt-3 rounded-xl bg-[var(--warn-soft)] px-3 py-2 text-xs font-medium text-[var(--warn)]">{formError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={savingMedia} onClick={saveMedia} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50">
              {savingMedia ? "Enregistrement…" : "Enregistrer le média"}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
              Annuler
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {filteredMedia.map((m) => {
          const isSel = selected.includes(m.id);
          return (
            <Card key={m.id} className={`overflow-hidden transition-shadow ${isSel ? "ring-2 ring-[var(--accent)]" : ""}`}>
              <div className="relative aspect-[4/3]" style={{ background: m.gradient }}>
                <span className="absolute inset-0 flex items-center justify-center text-white/85">
                  {m.kind === "Vidéo" ? <Video className="h-9 w-9" /> : <Images className="h-9 w-9" />}
                </span>
                <label className="absolute left-2 top-2 flex cursor-pointer items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => setSelected((prev) => (isSel ? prev.filter((x) => x !== m.id) : [...prev, m.id]))}
                    className="h-3.5 w-3.5 accent-[#8b5cf6]"
                  />
                  Select
                </label>
                <span className="absolute right-2 top-2">
                  <PlatformBadge platform={m.source} />
                </span>
                <span className="mono absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Star className="h-3 w-3" fill="currentColor" /> {m.price}
                </span>
                {m.remote && <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Synced</span>}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold">{m.title}</p>
                <p className="mt-0.5 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{m.kind} · {PLATFORM_META[m.source].label}</span>
                  <span className="mono">{m.sales} ventes</span>
                </p>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  <label className="block">
                    <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide" style={{ color: PLATFORM_META.telegram.color }}>TG ★</span>
                    <input
                      type="number"
                      min={1}
                      value={m.price}
                      aria-label={`Prix Telegram (Stars) de ${m.title}`}
                      onChange={(e) => setMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, price: parseInt(e.target.value, 10) || 0 } : x)))}
                      className="mono w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1 text-[11px]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide" style={{ color: PLATFORM_META.onlyfans.color }}>OF $</span>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={m.ofPrice}
                      aria-label={`Prix OnlyFans ($) de ${m.title}`}
                      onChange={(e) => setMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, ofPrice: parseFloat(e.target.value) || 0 } : x)))}
                      className="mono w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1 text-[11px]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide" style={{ color: PLATFORM_META.mym.color }}>MYM €</span>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={m.mymPrice}
                      aria-label={`Prix MYM (€) de ${m.title}`}
                      onChange={(e) => setMedia((prev) => prev.map((x) => (x.id === m.id ? { ...x, mymPrice: parseFloat(e.target.value) || 0 } : x)))}
                      className="mono w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1 text-[11px]"
                    />
                  </label>
                </div>
              </div>
            </Card>
          );
        })}
        {filteredMedia.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--muted)]">
            Aucun média pour ce filtre. Ajoutez-en un avec « Add media » ou changez de plateforme.
          </p>
        )}
      </div>
    </div>
  );

  const PersonaPage = (
    <div className="rise grid gap-5 xl:grid-cols-3">
      <Card className="p-5 xl:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-[var(--accent)]" /> Configuration de la persona</h3>
          <Chip tone="accent">{personaSaves} version(s) enregistrée(s)</Chip>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="pname">Nom de l'assistante</label>
            <input id="pname" value={persona.name} onChange={(e) => setPersona({ ...persona, name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <span className={labelCls}>Ton principal</span>
            <div className="flex flex-wrap gap-1.5">
              {["Warm & playful", "Direct & pro", "Glamour", "Friendly mentor"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPersona({ ...persona, tone: t })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    persona.tone === t ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--surface-3)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {(
          [
            ["speaks", "How it speaks", "Style, langue, niveau de familiarité…"],
            ["reacts", "How it reacts", "Objections prix, fans impolis, demandes sensibles…"],
            ["instructions", "Instructions", "Règles dures que l'IA ne doit jamais enfreindre…"],
            ["knowledge", "Knowledge base", "Catalogue, prix, planning, politiques…"],
          ] as const
        ).map(([key, label, ph]) => (
          <div key={key} className="mt-4">
            <label className={labelCls} htmlFor={`pf-${key}`}>{label}</label>
            <textarea
              id={`pf-${key}`}
              value={persona[key]}
              onChange={(e) => setPersona({ ...persona, [key]: e.target.value })}
              placeholder={ph}
              rows={3}
              className={`${inputCls} resize-y leading-relaxed`}
            />
          </div>
        ))}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" disabled={savingPersona} onClick={savePersona} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50">
            {savingPersona ? "Enregistrement…" : "Save persona"}
          </button>
          <span className="text-xs text-[var(--muted)]">
            {backend === "online" ? "Backend connecté — les versions sont conservées." : backend === "offline" ? "Backend indisponible pour le moment : l'enregistrement échouera proprement." : "Connexion au backend…"}
          </span>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <h3 className="text-sm font-semibold">Aperçu en direct</h3>
        <div className="mt-3 space-y-2.5 rounded-2xl bg-[var(--surface-2)] p-3">
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">Salut ! C'est combien pour le pack studio ?</div>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] px-3 py-2 text-sm text-white shadow-sm">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white/80"><Bot className="h-3 w-3" /> {persona.name}</p>
            Hello ! Le pack studio, c'est 12 contenus exclusifs pour 450 Stars. Je t'envoie un aperçu ?
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-xs text-[var(--muted)]">
          <li className="flex gap-2"><Shield className="h-3.5 w-3.5 shrink-0 text-[var(--good)]" /> Escalade humaine automatique sur les demandes de remboursement.</li>
          <li className="flex gap-2"><Eye className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" /> Aperçus floutés uniquement, jamais le contenu complet avant paiement.</li>
          <li className="flex gap-2"><Zap className="h-3.5 w-3.5 shrink-0 text-[var(--warn)]" /> Réponse médiane : 8 secondes, 24 h/24.</li>
        </ul>
        <button type="button" onClick={() => setPage("inbox")} className="mt-4 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
          Tester dans Fan Inbox
        </button>
      </Card>
    </div>
  );

  const BroadcastPage = (
    <div className="rise grid gap-5 xl:grid-cols-3">
      <Card className="p-5 xl:col-span-1">
        <h3 className="text-sm font-semibold">Nouvelle campagne</h3>
        <div className="mt-4">
          <label className={labelCls} htmlFor="bt">Titre interne</label>
          <input id="bt" value={bcTitle} onChange={(e) => setBcTitle(e.target.value)} placeholder="Ex. Promo vendredi soir" className={inputCls} />
        </div>
        <div className="mt-4">
          <label className={labelCls} htmlFor="ba">Audience</label>
          <select id="ba" value={bcAudience} onChange={(e) => setBcAudience(e.target.value)} className={inputCls}>
            <option>Fans actifs (30 j)</option>
            <option>Acheteurs Gallery</option>
            <option>Conversations sans achat</option>
            <option>Tous les fans</option>
          </select>
        </div>
        <div className="mt-4">
          <label className={labelCls} htmlFor="bm">Message</label>
          <textarea id="bm" value={bcMessage} onChange={(e) => setBcMessage(e.target.value)} rows={4} placeholder="Bonsoir tout le monde, nouveau pack dispo ce soir…" className={`${inputCls} resize-y`} />
        </div>
        <button type="button" disabled={savingBc} onClick={saveCampaign} className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {savingBc ? "Enregistrement…" : "Save draft"}
        </button>
        <p className="mt-2 text-center text-[11px] text-[var(--muted)]">L'envoi réel se déclenche depuis Telegram une fois le brouillon validé.</p>
      </Card>

      <Card className="xl:col-span-2">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-sm font-semibold">Campagnes</h3>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Send className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p className="text-xs text-[var(--muted)]">{c.audience} · {c.when}</p>
              </div>
              <div className="text-right">
                <p className="mono text-sm font-semibold">{c.sent > 0 ? `${fmt(c.sent)} envois` : "—"}</p>
                <p className="text-xs text-[var(--muted)]">{c.revenue > 0 ? `${fmt(c.revenue)} Stars générés` : "Aucun revenu pour l'instant"}</p>
              </div>
              <Chip tone={c.status === "Envoyée" ? "good" : c.status === "Programmée" ? "accent" : "warn"}>{c.status}</Chip>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

  const FlowsPage = (
    <div className="rise space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">Bot &amp; Channel Flows — séquences automatiques déclenchées par vos fans.</p>
        <button
          type="button"
          onClick={() => {
            setFlows((prev) => [{ id: newKey("flow"), name: "Nouveau flow", trigger: "Déclencheur à définir", steps: ["Premier message"], active: false }, ...prev]);
            showToast("Flow ajouté — activez-le quand il est prêt");
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0a0a0a] px-3.5 py-2 text-sm font-semibold text-white hover:opacity-85 dark:bg-white dark:text-black"
        >
          <Plus className="h-4 w-4" /> New flow
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {flows.map((f) => (
          <Card key={f.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{f.name}</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Trigger : {f.trigger}</p>
              </div>
              <Toggle small on={f.active} onClick={() => setFlows((prev) => prev.map((x) => (x.id === f.id ? { ...x, active: !x.active } : x)))} />
            </div>
            <ol className="mt-3 space-y-1.5">
              {f.steps.map((s, i) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-bold text-[var(--muted)]">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs font-medium">{f.active ? <span className="text-[var(--good)]">Actif — s'exécute automatiquement</span> : <span className="text-[var(--muted)]">Inactif</span>}</p>
          </Card>
        ))}
      </div>
    </div>
  );

  const StatsPage = (
    <div className="rise space-y-5">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Revenue (30 j)", value: "$612.40", sub: "47 110 Stars" },
          { label: "Conversion inbox", value: "23,6 %", sub: "+3,1 pts vs mois dernier" },
          { label: "Nouveaux fans", value: "312", sub: "via tracking links" },
          { label: "Panier moyen", value: "287 Stars", sub: "≈ $3.73 par achat" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{s.label}</p>
            <p className="mono mt-2 text-[24px] font-bold leading-none">{s.value}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Stars par jour</h3>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={SALES_7D} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} formatter={(v: any) => [`${fmt(Number(v))} Stars`, "Stars"]} />
              <Bar dataKey="stars" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-[var(--accent)]" /> Tracking links</h3>
          <button
            type="button"
            onClick={() => showToast("Les nouveaux liens se créent depuis le bot Telegram")}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-2)]"
          >
            <Plus className="h-3.5 w-3.5" /> New link
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-2.5 font-semibold">Lien</th>
                <th className="px-4 py-2.5 font-semibold">Clics</th>
                <th className="px-4 py-2.5 font-semibold">Conversion</th>
                <th className="px-4 py-2.5 font-semibold">Revenu</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {TRACKING_LINKS.map((l) => (
                <tr key={l.name}>
                  <td className="mono px-4 py-3 text-[13px] font-medium">{l.name}</td>
                  <td className="mono px-4 py-3">{fmt(l.clicks)}</td>
                  <td className="px-4 py-3">{l.conv}</td>
                  <td className="mono px-4 py-3 font-semibold">{l.revenue}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => copyText(`https://${l.name}`)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold hover:bg-[var(--surface-2)]">
                      <Copy className="h-3 w-3" /> Copier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const LivePage = (
    <div className="rise space-y-5">
      {/* Bandeau temps réel */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Bots LIVE", value: String(connectedBots.length), sub: `sur ${bots.length} modèle(s) configuré(s)` },
          { label: "Fans en ligne", value: fmt(fansOnlineTotal), sub: "connectés en ce moment" },
          { label: "Fans total", value: fmt(bots.reduce((a, b) => a + b.fansCount, 0)), sub: "tous modèles confondus" },
          { label: "Revenus aujourd'hui", value: `${fmt(connectedBots.reduce((a, b) => a + b.revenueToday, 0))} Stars`, sub: "bots connectés uniquement" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--good)]" /> {s.label}
            </p>
            <p className="mono mt-2 text-[24px] font-bold leading-none">{s.value}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{s.sub}</p>
          </Card>
        ))}
      </div>

      {/* Grille des bots */}
      <div className="grid gap-5 lg:grid-cols-2">
        {bots.map((b) => {
          const botFans = convs.filter((c) => c.botId === b.id);
          return (
            <Card key={b.id} className={`p-5 ${b.connected ? "" : "opacity-75"}`}>
              <div className="flex items-start gap-3.5">
                <LiveAvatar name={b.modelName} src={b.telegramAvatarUrl} gradient={b.gradient} size="xl" live={b.connected} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-base font-bold leading-tight">
                    {b.modelName}
                    {b.connected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--good)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> Live
                      </span>
                    ) : (
                      <Chip>Offline</Chip>
                    )}
                  </p>
                  <p className="mono mt-0.5 truncate text-xs text-[var(--muted)]">{b.telegramUsername || "Bot non configuré"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.telegramToken ? "bg-[var(--good-soft)] text-[var(--good)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                      <Send className="h-3 w-3" /> Telegram {b.telegramToken ? "clé OK" : "sans clé"}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.onlyfansKey ? "bg-[var(--good-soft)] text-[var(--good)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                      <Heart className="h-3 w-3" /> OnlyFans {b.onlyfansKey ? "clé OK" : "sans clé"}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.mymToken ? "bg-[var(--good-soft)] text-[var(--good)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                      <Sparkles className="h-3 w-3" /> MYM {b.mymToken ? "clé OK" : "sans clé"}
                    </span>
                  </div>
                </div>
                {!b.connected && (
                  <button
                    type="button"
                    onClick={() => setPage("settings")}
                    className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)]"
                  >
                    Connecter
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2.5">
                  <p className="mono text-sm font-bold">{b.connected ? b.fansOnline : 0}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">En ligne</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2.5">
                  <p className="mono text-sm font-bold">{fmt(b.fansCount)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Fans</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2.5">
                  <p className="mono text-sm font-bold">{fmt(b.revenueToday)} ★</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Aujourd'hui</p>
                </div>
              </div>

              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <span>Fans connectés</span>
                  <span className="mono normal-case">{botFans.length}</span>
                </p>
                {botFans.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Aucun fan connecté à ce bot pour le moment.</p>
                ) : (
                  <ul className="space-y-1">
                    {botFans.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveConvId(c.id);
                            setBotFilter("all");
                            updateConv(c.id, { unread: 0 });
                            setPage("inbox");
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
                        >
                          <span className="relative shrink-0">
                            <Avatar initials={c.initials} color={c.color} size="sm" />
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--good)] ring-2 ring-[var(--surface)]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{c.name}</span>
                            <span className="block truncate text-xs text-[var(--muted)]">{c.last}</span>
                          </span>
                          <PlatformBadge platform={c.platform} withLabel={false} />
                          {c.unread > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">{c.unread}</span>
                          )}
                          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-[var(--muted)]">
        Cliquez sur un fan pour ouvrir directement sa conversation. Les bots se connectent dans Settings &gt; Bots &amp; Modèles (photo de profil réelle récupérée via getMe + getUserProfilePhotos).
      </p>
    </div>
  );

  const SettingsPage = (
    <div className="rise space-y-5">
      {/* Bots & Modèles */}
      <section aria-label="Bots et modèles">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold leading-tight">Bots &amp; Modèles</h2>
            <p className="text-xs text-[var(--muted)]">Chaque modèle connecte son bot Telegram, sa clé OnlyFans et son token MYM. Les bots LIVE apparaissent dans la page Live Models.</p>
          </div>
          <button
            type="button"
            onClick={() => openBotForm()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#0a0a0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-85 dark:bg-white dark:text-black"
          >
            <Plus className="h-4 w-4" /> Ajouter un nouveau Bot/Modèle
          </button>
        </div>

        {botFormOpen && (
          <Card className="mb-4 p-4">
            <h3 className="text-sm font-semibold">{editingBotId ? "Éditer le bot / modèle" : "Nouveau bot / modèle"}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="bot-name">Nom du modèle</label>
                <input id="bot-name" value={botForm.modelName} onChange={(e) => setBotForm({ ...botForm, modelName: e.target.value })} placeholder="Ex. Sofia Laurent" className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="bot-tg">Token Telegram (BotFather)</label>
                <input id="bot-tg" type="password" value={botForm.telegramToken} onChange={(e) => setBotForm({ ...botForm, telegramToken: e.target.value })} placeholder="123456789:AAH…" className={`${inputCls} mono text-[13px]`} autoComplete="off" spellCheck={false} />
              </div>
              <div>
                <label className={labelCls} htmlFor="bot-of-user">Nom d'utilisateur OnlyFans</label>
                <input id="bot-of-user" value={botForm.onlyfansUsername} onChange={(e) => setBotForm({ ...botForm, onlyfansUsername: e.target.value })} placeholder="@pseudo" className={inputCls} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls} htmlFor="bot-of-key">Clé API OnlyFans</label>
                <input id="bot-of-key" type="password" value={botForm.onlyfansKey} onChange={(e) => setBotForm({ ...botForm, onlyfansKey: e.target.value })} placeholder="of_live_…" className={`${inputCls} mono text-[13px]`} autoComplete="off" spellCheck={false} />
              </div>
              <div>
                <label className={labelCls} htmlFor="bot-mym">Token MYM.fans</label>
                <input id="bot-mym" type="password" value={botForm.mymToken} onChange={(e) => setBotForm({ ...botForm, mymToken: e.target.value })} placeholder="mym_…" className={`${inputCls} mono text-[13px]`} autoComplete="off" spellCheck={false} />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              Les accès sont enregistrés dans la collection « bots ». Après l'enregistrement, cliquez « Connecter » sur la carte : l'app vérifie le bot via getMe et récupère sa vraie photo de profil (getUserProfilePhotos) par le proxy interne.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void saveBotForm()} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
                {editingBotId ? "Enregistrer les modifications" : "Ajouter le bot"}
              </button>
              <button type="button" onClick={() => setBotFormOpen(false)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
                Annuler
              </button>
            </div>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bots.map((b) => {
            const busy = savingBot === b.id;
            return (
              <Card
                key={b.id}
                className="cursor-pointer p-4 transition-shadow hover:shadow-[var(--shadow)]"
              >
                <div onClick={() => openBotForm(b)} title="Cliquer pour éditer">
                  <div className="flex items-start gap-3">
                    <LiveAvatar name={b.modelName} src={b.telegramAvatarUrl} gradient={b.gradient} size="lg" live={b.connected} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold leading-tight">{b.modelName}</p>
                      <p className="mono truncate text-[11px] text-[var(--muted)]">{b.telegramUsername || "Bot à configurer"}</p>
                      <span className="mt-1.5 inline-flex">
                        {b.connected ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--good)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> Live
                          </span>
                        ) : (
                          <Chip>Offline</Chip>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2">
                      <p className="mono text-[13px] font-bold">{fmt(b.balanceStars)} ★</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">Balance</p>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2">
                      <p className="mono text-[13px] font-bold">{fmt(b.fansCount)}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">Fans</p>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2">
                      <p className="mono text-[13px] font-bold">{b.connected ? b.fansOnline : 0}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">En ligne</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.telegramToken ? "bg-[var(--good-soft)] text-[var(--good)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>TG {b.telegramToken ? "✓" : "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.onlyfansKey ? "bg-[var(--good-soft)] text-[var(--good)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>OF {b.onlyfansKey ? "✓" : "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.mymToken ? "bg-[var(--good-soft)] text-[var(--good)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>MYM {b.mymToken ? "✓" : "—"}</span>
                    {b.remote && <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">Enregistré</span>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3" onClick={(e) => e.stopPropagation()}>
                  {b.connected ? (
                    <button type="button" disabled={busy} onClick={() => void disconnectBot(b)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">
                      <Power className="h-3 w-3" /> {busy ? "…" : "Déconnecter"}
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void connectBot(b)} className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50">
                      <PlugZap className="h-3 w-3" /> {busy ? "Connexion…" : "Connecter"}
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void connectBot(b)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">
                    <RefreshCw className="h-3 w-3" /> Tester
                  </button>
                  <button type="button" onClick={() => openBotForm(b)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--surface-2)]">
                    <Pencil className="h-3 w-3" /> Éditer
                  </button>
                  <button type="button" onClick={() => void deleteBot(b)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--danger)] hover:bg-[var(--surface-2)]">
                    <Trash2 className="h-3 w-3" /> Supprimer
                  </button>
                </div>
              </Card>
            );
          })}
          {bots.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--muted)]">
              Aucun bot pour le moment. Cliquez « Ajouter un nouveau Bot/Modèle » pour connecter votre premier modèle.
            </p>
          )}
        </div>
      </section>

      {/* Monetization & Tokens */}
      <section aria-label="Monetization and tokens">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold leading-tight">Monetization &amp; Tokens</h2>
            <p className="text-xs text-[var(--muted)]">Connectez vos plateformes : les tokens sont enregistrés dans la base de l'app et le statut passe à Connected dès la validation.</p>
          </div>
          <span className="ml-auto">
            <Chip tone={PLATFORMS.some((p) => integrations[p].connected) ? "good" : "neutral"}>
              {PLATFORMS.filter((p) => integrations[p].connected).length}/3 plateformes connectées
            </Chip>
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLATFORMS.map((p) => renderIntegrationCard(p))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold">Workspace</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ws">Nom du workspace</label>
              <input id="ws" defaultValue="Atelier de Sofia" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="bot">Bot Telegram lié</label>
              <input id="bot" defaultValue="@atelier_prive_bot" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="chan">Channel lié</label>
              <input id="chan" defaultValue="@atelier_prive" className={inputCls} />
            </div>
            <div>
              <span className={labelCls}>Thème</span>
              <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Passer en clair" : "Passer en sombre"}
              </button>
            </div>
          </div>
          <button type="button" onClick={() => showToast("Préférences du workspace enregistrées")} className="mt-5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
            Save changes
          </button>

          <h3 className="mt-8 text-sm font-semibold">Team</h3>
          <ul className="mt-3 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
            {team.map((m) => (
              <li key={m.name} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar initials={m.initials} color={m.color} size="sm" />
                <span className="flex-1 text-sm font-medium">{m.name}</span>
                <Chip>{m.role}</Chip>
              </li>
            ))}
          </ul>
          {inviteOpen ? (
            <div className="mt-3 flex gap-2">
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Nom du membre" className={inputCls} />
              <button
                type="button"
                onClick={() => {
                  const n = inviteName.trim();
                  if (!n) return;
                  const initials = n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                  setTeam((prev) => [...prev, { initials, name: n, role: "Support", color: "#6366f1" }]);
                  setInviteName("");
                  setInviteOpen(false);
                  showToast(`${n} ajouté à l'équipe`);
                }}
                className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
              >
                Ajouter
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setInviteOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
              <UserPlus className="h-4 w-4" /> Invite member
            </button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            Stockage du workspace : les enregistrements de l'app (médias, personas, campagnes, intégrations) sont conservés via le backend intégré, dans la limite de 1 000 enregistrements au total.
          </p>
        </Card>

        <div className="space-y-4">
          {[
            { name: "Free", price: "$0", desc: "1 bot, 50 conversations / mois, Gallery 10 médias", current: false },
            { name: "Starter", price: "$29.90", desc: "Conversations illimitées, AI Persona, Broadcast", current: true },
            { name: "Pro", price: "$59.90", desc: "Team 10 sièges, Flows avancés, tracking links illimités", current: false },
          ].map((p) => (
            <Card key={p.name} className={`p-4 ${p.current ? "ring-2 ring-[var(--accent)]" : ""}`}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{p.name}</h4>
                {p.current ? <Chip tone="accent"><Check className="h-3 w-3" /> Plan actuel</Chip> : <span className="mono text-sm font-bold">{p.price}<span className="text-xs font-medium text-[var(--muted)]">/mo</span></span>}
              </div>
              {p.current && <p className="mono mt-1 text-sm font-bold">{p.price}<span className="text-xs font-medium text-[var(--muted)]">/mo</span></p>}
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{p.desc}</p>
            </Card>
          ))}
          <Card className="p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-[var(--accent)]" /> Balance Stars</h4>
            <p className="mono mt-2 text-2xl font-bold">11,590 Stars</p>
            <p className="text-xs text-[var(--muted)]">≈ $150.67 · retrait disponible à partir de 1 000 Stars</p>
            <button type="button" onClick={() => showToast("Les retraits se font en TON ou USDT depuis Telegram")} className="mt-3 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
              Demander un retrait
            </button>
          </Card>
        </div>
      </div>
    </div>
  );

  const pages: Record<Page, React.ReactNode> = {
    dashboard: DashboardPage,
    live: LivePage,
    inbox: InboxPage,
    gallery: GalleryPage,
    persona: PersonaPage,
    broadcast: BroadcastPage,
    flows: FlowsPage,
    stats: StatsPage,
    settings: SettingsPage,
  };

  /* ---------------------------------------------------------------- */
  /*  Shell                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div
      data-safe-area-inset-root
      data-theme={theme}
      style={{ boxSizing: "border-box", paddingTop: "var(--safe-area-inset-top)", height: "100dvh" }}
      className="overflow-x-clip bg-[var(--bg)] text-[var(--ink)]"
    >
      <div className="flex h-full min-w-0">
        {/* Sidebar */}
        <aside className="flex w-16 shrink-0 flex-col bg-[var(--sidebar)] text-white lg:w-60">
          <div className="flex items-center gap-2.5 px-3 py-4 lg:px-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8b5cf6] text-white">
              <Globe className="h-5 w-5" />
            </span>
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-[15px] font-bold leading-tight text-white">
                Omni<span className="text-[#8b5cf6]">Fans.io</span>
              </span>
              <span className="block text-[11px] text-white/50">AI CRM &amp; Multi-Platform</span>
            </span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2 lg:px-3" aria-label="Navigation principale">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setPage(n.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${
                  page === n.id ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                <n.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="hidden flex-1 text-left lg:block">{n.label}</span>
                {n.badge && (
                  <span className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-bold lg:flex">{n.badge}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="space-y-3 px-2 pb-4 lg:px-3">
            <div className="hidden rounded-2xl bg-[var(--sidebar-2)] p-3 lg:block">
              <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Team <Users className="h-3.5 w-3.5" />
              </p>
              <div className="mt-2 flex -space-x-1.5">
                {team.map((m) => (
                  <span key={m.name} className="ring-2 ring-[var(--sidebar-2)]">
                    <Avatar initials={m.initials} color={m.color} size="sm" />
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/45">{team.length} membres · plan Starter</p>
            </div>
            <div className="rounded-2xl bg-[var(--sidebar-2)] p-3">
              <p className="hidden items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/45 lg:flex">
                <Wallet className="h-3.5 w-3.5" /> Balance
              </p>
              <p className="mono mt-1 flex items-center gap-1 text-sm font-bold lg:text-base">
                <Star className="h-4 w-4 text-[var(--accent)]" fill="currentColor" /> 11,590
              </p>
              <p className="hidden text-[11px] text-white/45 lg:block">≈ $150.67</p>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-safe-area-sticky-top
            style={{ top: "var(--safe-area-inset-top)" }}
            className="sticky z-30 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur"
          >
            <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight lg:text-lg">{pageTitle[page].title}</h1>
                <p className="hidden truncate text-xs text-[var(--muted)] sm:block">{pageTitle[page].sub}</p>
              </div>
              <div className="relative ml-auto w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher fans, médias…"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm placeholder:text-[var(--muted)]"
                  aria-label="Recherche globale"
                />
              </div>
              <span
                className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold md:inline-flex ${
                  backend === "online" ? "bg-[var(--good-soft)] text-[var(--good)]" : backend === "offline" ? "bg-[var(--warn-soft)] text-[var(--warn)]" : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
                title="État du backend d'enregistrements"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${backend === "online" ? "bg-[var(--good)]" : backend === "offline" ? "bg-[var(--warn)]" : "bg-[var(--muted)]"}`} />
                {backend === "online" ? "Backend connecté" : backend === "offline" ? "Backend indisponible" : "Connexion…"}
              </span>
              <button
                type="button"
                onClick={() => setPage("live")}
                className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[var(--good-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--good)] hover:opacity-85 md:inline-flex"
                title="Voir les bots connectés et leurs fans en ligne"
              >
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
                {connectedBots.length} bot{connectedBots.length > 1 ? "s" : ""} connecté{connectedBots.length > 1 ? "s" : ""} · {fansOnlineTotal} fans en ligne
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                aria-label="Basculer le thème"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {notifCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">{notifCount}</span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-11 z-40 w-72 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow)]">
                    {[
                      { t: "Nouvelle vente : Studio Session — Pack 12 (+450 Stars)", w: "il y a 4 min" },
                      { t: "L'IA a escaladé une conversation vers vous (Emma R.)", w: "il y a 26 min" },
                      { t: "Broadcast « Promo week-end » terminé : 6 840 Stars", w: "hier" },
                    ].map((n) => (
                      <div key={n.t} className="rounded-xl px-2.5 py-2 hover:bg-[var(--surface-2)]">
                        <p className="text-xs font-medium leading-snug">{n.t}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{n.w}</p>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setNotifCount(0); setNotifOpen(false); showToast("Notifications marquées comme lues"); }}
                      className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl bg-[var(--surface-2)] px-2 py-2 text-xs font-semibold hover:bg-[var(--surface-3)]"
                    >
                      <Check className="h-3.5 w-3.5" /> Tout marquer comme lu
                    </button>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setPage("settings")} className="shrink-0" aria-label="Ouvrir le profil et les réglages">
                <Avatar initials="SL" color="#8b5cf6" />
              </button>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
            <div className="mx-auto w-full max-w-6xl">{pages[page]}</div>
            <footer className="mx-auto mt-8 flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 pb-2 text-[11px] text-[var(--muted)]">
              <span>OmniFans.io — AI CRM multi-plateforme pour vendre en Telegram Stars.</span>
              <span className="inline-flex items-center gap-1">
                Propulsé par Telegram Stars <Star className="h-3 w-3 text-[var(--accent)]" fill="currentColor" />
              </span>
            </footer>
          </main>
        </div>
      </div>

      {/* -------- Modales de la barre d'outils du chat -------- */}
      {panel === "voice" && (
        <Modal title="Générer une note vocale" icon={Mic} onClose={() => setPanel(null)}>
          <div>
            <label className={labelCls} htmlFor="voice-style">Style de voix</label>
            <select id="voice-style" value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value)} className={inputCls}>
              {VOICE_STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <label className={labelCls} htmlFor="voice-text">Texte à vocaliser</label>
            <textarea
              id="voice-text"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              rows={4}
              placeholder="Ex. Coucou, merci pour ton message, je te prépare une surprise…"
              className={`${inputCls} resize-y`}
            />
            <p className="mt-1.5 text-[11px] text-[var(--muted)]">La voix IA lit ce texte avec le style choisi, puis l'envoie dans la conversation avec {activeConv.name}.</p>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={generateVoice}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
            >
              <Mic className="h-4 w-4" /> Générer
            </button>
            <button type="button" onClick={() => setPanel(null)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]">
              Annuler
            </button>
          </div>
        </Modal>
      )}

      {panel === "ppv" && (
        <Modal title="Envoyer PPV" icon={DollarSign} onClose={() => setPanel(null)} wide>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Choisissez un média de la Galerie. Le prix s'affiche dans la devise de {activeConv.name} ({PLATFORM_META[activeConv.platform].label}), puis la facture PPV est envoyée au fan{activeConv.platform === "telegram" ? " via le bot Telegram connecté (proxy interne)" : ""}.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {media.map((m) => {
              const selPpv = m.id === ppvId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setPpvId(m.id); setPpvPrice(String(priceFor(m, activeConv.platform))); }}
                  aria-pressed={selPpv}
                  className={`overflow-hidden rounded-xl border text-left transition ${selPpv ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--line-strong)]"}`}
                >
                  <span className="relative block aspect-[4/3]" style={{ background: m.gradient }}>
                    <span className="absolute inset-0 flex items-center justify-center text-white/90">
                      {m.kind === "Vidéo" ? <Video className="h-6 w-6" /> : <Images className="h-6 w-6" />}
                    </span>
                    {selPpv && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span className="block p-2">
                    <span className="block truncate text-[11px] font-semibold">{m.title}</span>
                    <span className="mono block text-[11px] text-[var(--muted)]">{fmtPrice(priceFor(m, activeConv.platform), activeConv.platform)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {(() => {
            const item = media.find((m) => m.id === ppvId) ?? media[0];
            if (!item) return null;
            return (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="ppv-price">Prix pour ce fan ({PLATFORM_META[activeConv.platform].label})</label>
                    <input
                      id="ppv-price"
                      type="number"
                      min={0}
                      step={activeConv.platform === "telegram" ? 1 : 0.5}
                      value={ppvPrice}
                      onChange={(e) => setPpvPrice(e.target.value)}
                      className={`${inputCls} mono`}
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Référence Galerie : {item.price} Stars / ${item.ofPrice.toFixed(2)} / €{item.mymPrice.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className={labelCls}>Options</span>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                      <input type="checkbox" checked={ppvTeaser} onChange={(e) => setPpvTeaser(e.target.checked)} className="h-4 w-4 accent-[#8b5cf6]" />
                      Texte teaser
                    </label>
                    <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                      <input type="checkbox" checked={ppvGift} onChange={(e) => setPpvGift(e.target.checked)} className="h-4 w-4 accent-sky-500" />
                      <Gift className="h-4 w-4 shrink-0 text-sky-500" /> Offrir gratuitement (cadeau)
                    </label>
                  </div>
                </div>
                {ppvTeaser && (
                  <div className="mt-3">
                    <label className={labelCls} htmlFor="ppv-teaser">Texte teaser (visible avant déblocage)</label>
                    <input
                      id="ppv-teaser"
                      value={ppvTeaserText}
                      onChange={(e) => setPpvTeaserText(e.target.value)}
                      placeholder="Ex. Un petit aperçu de ce qui t'attend…"
                      className={inputCls}
                    />
                  </div>
                )}
              </>
            );
          })()}

          {(() => {
            const item = media.find((m) => m.id === ppvId) ?? media[0];
            if (!item) return null;
            const bot = bots.find((b) => b.id === activeConv.botId);
            const custom = parseFloat(ppvPrice);
            const channels: { p: Platform; label: string; price: number; bg: string }[] = [];
            if ((bot?.telegramToken || integrations.telegram.token).trim())
              channels.push({ p: "telegram", label: "Envoyer via Telegram", price: item.price, bg: "#8b5cf6" });
            if ((bot?.onlyfansKey || integrations.onlyfans.token).trim())
              channels.push({ p: "onlyfans", label: "Envoyer via OnlyFans", price: item.ofPrice, bg: "#00aff0" });
            if ((bot?.mymToken || integrations.mym.token).trim())
              channels.push({ p: "mym", label: "Envoyer via MYM", price: item.mymPrice, bg: "#e84393" });
            return (
              <div className="mt-5 space-y-2">
                <p className={labelCls}>{ppvGift ? "Envoi gratuit" : "Envoyer en live via"}</p>
                {ppvGift ? (
                  <button
                    type="button"
                    onClick={() => sendGiftPpv(item)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    <Gift className="h-4 w-4" /> Envoyer le cadeau gratuitement
                  </button>
                ) : (
                <>
                {channels.length === 0 && (
                  <p className="rounded-xl bg-[var(--warn-soft)] px-3 py-2 text-xs font-medium text-[var(--warn)]">
                    Aucune plateforme connectée pour ce modèle — connectez un bot dans Settings &gt; Bots &amp; Modèles pour envoyer en live.
                  </p>
                )}
                {channels.map((ch) => (
                  <button
                    key={ch.p}
                    type="button"
                    disabled={sendingPpv}
                    onClick={async () => {
                      const price = ch.p === activeConv.platform && Number.isFinite(custom) && custom >= 0 ? custom : ch.price;
                      const ok = await sendPpv(item, price, ch.p);
                      if (ok) setPanel(null);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: ch.bg }}
                  >
                    <Send className="h-4 w-4" />
                    {sendingPpv ? "Envoi en cours…" : `${ch.label} (${fmtPrice(ch.p === activeConv.platform && Number.isFinite(custom) && custom >= 0 ? custom : ch.price, ch.p)})`}
                  </button>
                ))}
                </>
                )}
                <button
                  type="button"
                  onClick={() => setPanel(null)}
                  className="w-full rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]"
                >
                  Annuler
                </button>
              </div>
            );
          })()}
          <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
            Chaque envoi part en direct via le proxy interne de la plateforme choisie (telegram_proxy / onlyfans_proxy / mym_proxy) — aucun appel externe depuis le navigateur.
          </p>
        </Modal>
      )}

      {panel === "library" && (
        <Modal title="Galerie & Scripts" icon={FileText} onClose={() => setPanel(null)} wide>
          <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1" role="tablist" aria-label="Galerie ou scripts">
            {(
              [
                ["galerie", "Galerie"],
                ["scripts", "Scripts"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={libTab === t}
                onClick={() => setLibTab(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${libTab === t ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {libTab === "galerie" ? (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer les médias">
                {(
                  [
                    ["all", "Tous"],
                    ["Photo", "Photos"],
                    ["Vidéo", "Vidéos"],
                  ] as const
                ).map(([f, label]) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLibFilter(f)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${libFilter === f ? "bg-[#0a0a0a] text-white dark:bg-white dark:text-black" : "bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--surface-3)]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {media
                  .filter((m) => libFilter === "all" || m.kind === libFilter)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setAttached({ item: m, price: priceFor(m, activeConv.platform) });
                        setPanel(null);
                        showToast(`« ${m.title} » attaché au message`);
                      }}
                      className="overflow-hidden rounded-xl border border-[var(--line)] text-left transition hover:border-[var(--line-strong)]"
                    >
                      <span className="relative block aspect-[4/3]" style={{ background: m.gradient }}>
                        <span className="absolute inset-0 flex items-center justify-center text-white/90">
                          {m.kind === "Vidéo" ? <Video className="h-6 w-6" /> : <Images className="h-6 w-6" />}
                        </span>
                      </span>
                      <span className="block p-2">
                        <span className="block truncate text-[11px] font-semibold">{m.title}</span>
                        <span className="mono block text-[11px] text-[var(--muted)]">{fmtPrice(priceFor(m, activeConv.platform), activeConv.platform)}</span>
                      </span>
                    </button>
                  ))}
              </div>
              <p className="mt-3 text-[11px] text-[var(--muted)]">Cliquez un média pour l'attacher au message en cours (aperçu + badge prix au-dessus du champ).</p>
            </>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {SCRIPTS.map((s) => (
                  <li key={s.title}>
                    <button
                      type="button"
                      onClick={() => { insertText(s.text); setPanel(null); showToast(`Script « ${s.title} » inséré dans le message`); }}
                      className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold">
                        <FileText className="h-3.5 w-3.5 text-[var(--accent)]" /> {s.title}
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug text-[var(--ink-2)]">{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-[var(--muted)]">Scripts IA / réponses pré-enregistrées : le texte se colle dans le champ de message, modifiez-le avant l'envoi si besoin.</p>
            </>
          )}
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-xs items-center gap-2 rounded-2xl bg-[#0a0a0a] px-4 py-3 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-black">
          <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span className="min-w-0">{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Fermer le message" className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
