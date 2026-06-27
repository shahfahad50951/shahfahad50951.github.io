import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Linkedin,
  Mail,
  MapPin,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Menu,
  X,
  Clock,
  Calendar,
  Moon,
  Sun,
  Github,
} from "lucide-react";
import writingsData from "../content/generated/writings.json";

type Tag = string;
type ThemeMode = "light" | "dark";
type Route =
  | { kind: "home" }
  | { kind: "about" }
  | { kind: "writings" }
  | { kind: "article"; slug: string }
  | { kind: "not-found" };

interface TocItem {
  id: string;
  title: string;
  level: number;
}

interface Writing {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: number;
  tags: Tag[];
  bodyHtml: string;
  toc: TocItem[];
}

const BASE_PREFIX =
  import.meta.env.BASE_URL === "/"
    ? ""
    : import.meta.env.BASE_URL.replace(/\/$/, "");

const CONTACT = {
  email: "shahfahad.50951@gmail.com",
  githubLabel: "github.com/shahfahad50951",
  githubUrl: "https://github.com/shahfahad50951",
  linkedInLabel: "linkedin.com/in/shahfahad50951",
  linkedInUrl: "https://www.linkedin.com/in/shahfahad50951",
  location: "Bengaluru, India",
};

const THEME_STORAGE_KEY = "shah-fahad-theme";

const writings = writingsData as Writing[];
const ALL_TAGS: Tag[] = Array.from(
  new Set(writings.flatMap((writing) => writing.tags)),
).sort((a, b) => a.localeCompare(b));

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function hrefFor(path: string) {
  return `${BASE_PREFIX}${path}`;
}

function normalizePath(pathname: string) {
  let path = pathname;
  if (BASE_PREFIX && path.startsWith(BASE_PREFIX)) {
    path = path.slice(BASE_PREFIX.length) || "/";
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path = `${path}/`;
  return path;
}

function getInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function routeFromPath(pathname: string): Route {
  const path = normalizePath(pathname);
  if (path === "/") return { kind: "home" };
  if (path === "/about/") return { kind: "about" };
  if (path === "/writings/") return { kind: "writings" };

  const articleMatch = path.match(/^\/writings\/([^/]+)\/$/);
  if (articleMatch) {
    return writings.some((writing) => writing.slug === articleMatch[1])
      ? { kind: "article", slug: articleMatch[1] }
      : { kind: "not-found" };
  }

  return { kind: "not-found" };
}

function Chip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20"
          : "bg-zinc-800/80 text-zinc-400 ring-1 ring-white/[0.06]"
      }`}
    >
      {label}
    </span>
  );
}

function Divider() {
  return <div className="h-px w-full bg-white/[0.06]" />;
}

function LogoMark() {
  return (
    <span className="site-logo-mark" aria-hidden="true">
      <img src={hrefFor("/logo.svg")} alt="" />
    </span>
  );
}

function Header({
  route,
  navigate,
  theme,
  toggleTheme,
}: {
  route: Route;
  navigate: (path: string) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);

  const pages = [
    { label: "About", path: "/about/" },
    { label: "Writings", path: "/writings/" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return route.kind === "home";
    if (path === "/about/") return route.kind === "about";
    return route.kind === "writings" || route.kind === "article";
  };

  const internalClick = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(path);
    setOpen(false);
  };
  const themeLabel =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <header className="site-header sticky top-0 z-50 border-b border-white/[0.05] bg-[#09090b]/85 backdrop-blur-xl">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href={hrefFor("/")}
            onClick={internalClick("/")}
            className="group rounded-xl outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-amber-500/45"
            aria-label="Home"
            title="Home"
          >
            <LogoMark />
          </a>

          <nav
            className="site-nav-group hidden md:flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1"
            aria-label="Primary navigation"
          >
            {pages.map(({ label, path }) => (
              <a
                key={path}
                href={hrefFor(path)}
                onClick={internalClick(path)}
                className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
                  isActive(path)
                    ? "site-nav-active text-white bg-white/[0.08]"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045]"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div
          className="site-nav-group hidden md:flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1"
          aria-label="Contact and theme"
        >
          <a
            href={`mailto:${CONTACT.email}`}
            aria-label="Email"
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045] transition-colors"
          >
            <Mail size={15} />
          </a>
          <a
            href={CONTACT.linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045] transition-colors"
          >
            <Linkedin size={15} />
          </a>
          <a
            href={CONTACT.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045] transition-colors"
          >
            <Github size={15} />
          </a>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045] transition-colors"
            aria-label={themeLabel}
            title={themeLabel}
            type="button"
          >
            <ThemeIcon size={15} />
          </button>
        </div>

        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="site-nav-group p-2 rounded-full border border-white/[0.07] bg-white/[0.035] text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label={themeLabel}
            title={themeLabel}
            type="button"
          >
            <ThemeIcon size={18} />
          </button>

          <button
            onClick={() => setOpen(!open)}
            className="site-nav-group p-2 rounded-full border border-white/[0.07] bg-white/[0.035] text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label="Toggle menu"
            type="button"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#09090b]">
          <div className="max-w-[1240px] mx-auto px-5 py-4 space-y-1">
            {pages.map(({ label, path }) => (
              <a
                key={path}
                href={hrefFor(path)}
                onClick={internalClick(path)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive(path)
                    ? "site-nav-active text-white bg-white/[0.08]"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </a>
            ))}
            <div className="flex gap-1 pt-2 mt-2 border-t border-white/[0.06]">
              <a
                href={`mailto:${CONTACT.email}`}
                aria-label="Email"
                className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <Mail size={16} />
              </a>
              <a
                href={CONTACT.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <Linkedin size={16} />
              </a>
              <a
                href={CONTACT.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="p-2 rounded-md text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <Github size={16} />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function WritingCard({
  writing,
  navigate,
  variant = "default",
}: {
  writing: Writing;
  navigate: (path: string) => void;
  variant?: "default" | "compact";
}) {
  const path = `/writings/${writing.slug}/`;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(path);
  };

  if (variant === "compact") {
    return (
      <a
        href={hrefFor(path)}
        onClick={onClick}
        className="site-card site-card-interactive group block w-full text-left rounded-xl border border-white/[0.06] bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-white/[0.10] px-5 py-4 transition-all duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors leading-snug mb-1 line-clamp-1">
              {writing.title}
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span>{fmtDate(writing.date)}</span>
              <span>-</span>
              <span>{writing.readingTime} min read</span>
            </div>
          </div>
          <ArrowUpRight
            size={14}
            className="text-zinc-600 group-hover:text-amber-400 transition-colors flex-shrink-0 mt-0.5"
          />
        </div>
      </a>
    );
  }

  return (
    <a
      href={hrefFor(path)}
      onClick={onClick}
      className="group grid md:grid-cols-[132px_minmax(0,1fr)_32px] gap-4 px-5 py-5 transition-colors hover:bg-white/[0.025]"
    >
      <div className="text-xs text-zinc-600 leading-relaxed">
        <div className="flex items-center gap-1.5">
          <Calendar size={11} />
          {fmtDate(writing.date)}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Clock size={11} />
          {writing.readingTime} min read
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-zinc-200 group-hover:text-white transition-colors leading-snug mb-2">
          {writing.title}
        </h3>
        <p className="text-sm text-zinc-500 leading-relaxed mb-3">
          {writing.description}
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {writing.tags.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </div>
      </div>

      <div className="hidden md:flex justify-end">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-800/60 group-hover:bg-amber-500/15 border border-white/[0.06] group-hover:border-amber-500/20 transition-all duration-200">
            <ArrowRight
              size={13}
              className="text-zinc-500 group-hover:text-amber-400 transition-colors"
            />
          </div>
        </div>
      </div>
    </a>
  );
}

function HomePage({ navigate }: { navigate: (path: string) => void }) {
  const latestWriting = writings[0];
  const featuredImage =
    latestWriting?.slug === "cute-layouts"
      ? hrefFor(`/writings/${latestWriting.slug}/images/svg/00_layout_mental_model.svg`)
      : null;

  return (
    <main className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
      <section className="pt-14 pb-16 sm:pt-18">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_430px] gap-10 lg:gap-16 items-start">
          <div className="max-w-[780px]">
            <p className="text-sm text-amber-400 font-medium mb-5">
              Shah Fahad / GPU Systems & LLM Performance
            </p>

            <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.75rem] sm:text-[4.4rem] font-semibold leading-[0.98] tracking-tight text-white mb-7">
              Performance notes from the CUDA and LLM systems edge.
            </h1>

            <p className="text-lg text-zinc-400 leading-relaxed mb-5 max-w-[720px]">
              I am a Deep Learning Performance Engineer II at NVIDIA, working
              on benchmarking, profiling, and optimizing modern datacenter GPU
              workloads, primarily LLM inference and also training.
            </p>

            <p className="text-sm text-zinc-600 leading-[1.85] mb-9 max-w-[700px]">
              This site collects the practical side of that work: CUDA kernels,
              Nsight traces, memory behavior, TensorRT-LLM, CuTe/CUTLASS,
              cluster benchmarking, simulator correlation, and debugging notes
              that are useful after the immediate problem is gone.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <a
                href={hrefFor("/writings/")}
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/writings/");
                }}
                className="site-primary-action inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-all duration-150"
              >
                Read writings
                <ArrowRight size={15} />
              </a>
              <a
                href={hrefFor("/about/")}
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/about/");
                }}
                className="site-secondary-action inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150"
              >
                About
              </a>
              <a
                href={CONTACT.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="site-secondary-action inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150"
              >
                <Github size={15} />
                GitHub
              </a>
            </div>

            <div className="site-stat-strip grid grid-cols-3 max-w-[620px] rounded-xl border border-white/[0.06] bg-zinc-900/35 divide-x divide-white/[0.06] overflow-hidden">
              {[
                { label: "Writings", value: writings.length.toString() },
                { label: "Topics", value: ALL_TAGS.length.toString() },
                { label: "Latest", value: "CuTe" },
              ].map((item) => (
                <div key={item.label} className="px-4 py-3">
                  <p className="font-['Bricolage_Grotesque',sans-serif] text-xl font-semibold text-white leading-none">
                    {item.value}
                  </p>
                  <p className="text-[11px] uppercase tracking-widest text-zinc-700 mt-2">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {latestWriting && (
            <aside className="site-feature-card rounded-2xl border border-white/[0.07] bg-zinc-900/45 overflow-hidden shadow-[0_24px_70px_rgb(0_0_0_/_0.20)]">
              {featuredImage && (
                <div className="aspect-[1.55] border-b border-white/[0.06] bg-white/[0.03] overflow-hidden">
                  <img
                    src={featuredImage}
                    alt=""
                    className="h-full w-full object-cover object-left-top opacity-95"
                    loading="eager"
                  />
                </div>
              )}

              <a
                href={hrefFor(`/writings/${latestWriting.slug}/`)}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/writings/${latestWriting.slug}/`);
                }}
                className="group block p-5"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                    Latest writing
                  </p>
                  <ArrowUpRight
                    size={15}
                    className="text-zinc-600 group-hover:text-amber-400 transition-colors"
                  />
                </div>

                <h2 className="text-xl font-semibold text-zinc-100 group-hover:text-white leading-tight mb-3 transition-colors">
                  {latestWriting.title}
                </h2>
                <p className="text-sm text-zinc-500 leading-relaxed mb-5">
                  {latestWriting.description}
                </p>

                <div className="flex items-center justify-between gap-4 text-xs text-zinc-600">
                  <span>{fmtDate(latestWriting.date)}</span>
                  <span>{latestWriting.readingTime} min read</span>
                </div>
              </a>
            </aside>
          )}
        </div>
      </section>

      <Divider />

      <section className="py-14 pb-20">
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-8 lg:gap-14 items-start">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">
              Recent Writings
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed mb-5">
              Deep dives and practical notes from CUDA, GPU architecture, and
              LLM performance work.
            </p>
            <a
              href={hrefFor("/writings/")}
              onClick={(event) => {
                event.preventDefault();
                navigate("/writings/");
              }}
              className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors font-medium"
            >
              View all writings
              <ArrowRight size={14} />
            </a>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {writings.slice(0, 4).map((writing) => {
              const path = `/writings/${writing.slug}/`;

              return (
                <a
                  key={writing.slug}
                  href={hrefFor(path)}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(path);
                  }}
                  className="site-card site-card-interactive group flex min-h-[220px] flex-col rounded-xl border border-white/[0.06] bg-zinc-900/35 hover:bg-zinc-900/65 hover:border-white/[0.10] p-5 transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-4 text-xs text-zinc-600 mb-5">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={11} />
                      {fmtDate(writing.date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={11} />
                      {writing.readingTime} min
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-zinc-200 group-hover:text-white transition-colors leading-tight mb-3">
                    {writing.title}
                  </h3>
                  <p className="text-sm text-zinc-500 leading-relaxed mb-5">
                    {writing.description}
                  </p>

                  <div className="mt-auto flex items-end justify-between gap-4">
                    <div className="flex gap-1.5 flex-wrap">
                      {writing.tags.slice(0, 3).map((tag) => (
                        <Chip key={tag} label={tag} />
                      ))}
                    </div>
                    <ArrowRight
                      size={15}
                      className="text-zinc-600 group-hover:text-amber-400 transition-colors flex-shrink-0 mb-1"
                    />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

    </main>
  );
}

function AboutPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <main className="about-page max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
      <div className="pt-14 pb-24 sm:pt-16">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-14 lg:gap-16 xl:gap-20 items-start">
          <div>
            <section className="about-intro max-w-[780px]">
              <p className="text-sm text-amber-400 font-medium mb-4">About</p>
              <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.6rem] sm:text-[3.5rem] font-semibold text-white tracking-tight leading-[1.02] mb-6">
                I&apos;m Shah Fahad. I work on LLM performance across modern GPU
                systems.
              </h1>
              <p className="max-w-[720px] text-[1.05rem] text-zinc-400 leading-[1.8]">
                I am a Deep Learning Performance Engineer II at NVIDIA in
                Bengaluru. My work spans benchmarking, profiling, and
                optimization for modern datacenter GPU workloads, primarily LLM
                inference and also training.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={hrefFor("/writings/")}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate("/writings/");
                  }}
                  className="site-primary-action inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-all duration-150"
                >
                  Explore writings
                  <ArrowRight size={15} />
                </a>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="site-secondary-action inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150"
                >
                  <Mail size={15} />
                  Email me
                </a>
              </div>
            </section>

            <div className="about-story">
              {[
                {
                  title: "At NVIDIA",
                  paragraphs: [
                    "I work on benchmarking, profiling, and optimizing LLM workloads on modern datacenter GPUs. My work is primarily centered on inference, while also covering training performance.",
                    "That includes silicon-to-simulator performance correlation for LLM workloads, kernel-level GPU profiling, and infrastructure for repeatable performance analysis across HPC clusters.",
                  ],
                },
                {
                  title: "Current Engineering Focus",
                  paragraphs: [
                    "I study both end-to-end workload behavior and lower-level bottlenecks such as CPU launch overhead, kernel execution, memory movement, cluster repeatability, and hardware metric correlation.",
                    "My day-to-day work uses hardware execution metrics, simulator-based projections, Slurm, Docker, Nsight Systems, Nsight Compute, and C/C++ and Python infrastructure.",
                  ],
                },
                {
                  title: "Technical Writing",
                  paragraphs: [
                    "I write about topics I have worked through in depth. The articles currently on this site cover CuTe layouts and layout algebra, the roofline model, Hopper GPU memory consistency, and CUDA Graphs in LLM inference.",
                    "When learning a system, I often rebuild its abstractions from first principles, moving from NumPy and C++ implementations to CUDA kernels, cuBLAS baselines, and CuTe layout algebra.",
                  ],
                },
              ].map((section, index) => (
                <section className="about-story-section" key={section.title}>
                  <div className="about-story-heading">
                    <span>0{index + 1}</span>
                    <h2>{section.title}</h2>
                  </div>
                  <div className="about-story-copy">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

          </div>

          <aside className="about-sidebar">
            <section className="about-contact-card border p-5">
              <h2 className="about-sidebar-heading mb-4">
                Contact
              </h2>
              <div className="space-y-1">
                {[
                  {
                    icon: <Mail size={13} />,
                    label: CONTACT.email,
                    href: `mailto:${CONTACT.email}`,
                  },
                  {
                    icon: <Linkedin size={13} />,
                    label: CONTACT.linkedInLabel,
                    href: CONTACT.linkedInUrl,
                  },
                  {
                    icon: <Github size={13} />,
                    label: CONTACT.githubLabel,
                    href: CONTACT.githubUrl,
                  },
                  {
                    icon: <MapPin size={13} />,
                    label: CONTACT.location,
                    href: "https://www.google.com/maps/search/?api=1&query=Bengaluru%2C%20India",
                  },
                ].map(({ icon, label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="about-contact-link"
                  >
                    <span className="about-contact-icon">{icon}</span>
                    <span>{label}</span>
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </section>

            <section className="about-sidebar-card site-card border p-5">
              <h2 className="about-sidebar-heading mb-4">
                Experience
              </h2>
              <div className="about-timeline">
                {[
                  {
                    role: "Deep Learning Performance Engineer II",
                    place: "NVIDIA, Bengaluru",
                    date: "Mar 2026 - Present",
                  },
                  {
                    role: "Deep Learning Performance Engineer I, Datacenters",
                    place: "NVIDIA, Bengaluru",
                    date: "Aug 2024 - Feb 2026",
                  },
                  {
                    role: "Deep Learning Performance Intern",
                    place: "NVIDIA, Bengaluru",
                    date: "Jan 2024 - Aug 2024",
                  },
                ].map((item, index) => (
                  <div
                    key={`${item.role}-${item.date}`}
                    className={`about-timeline-item ${
                      index === 0 ? "is-current" : ""
                    }`}
                  >
                    <span className="about-timeline-dot" />
                    <p className="text-xs font-semibold text-zinc-300 leading-snug">
                      {item.role}
                    </p>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      {item.place}
                    </p>
                    <p className="text-[11px] text-zinc-700 mt-0.5">
                      {item.date}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="about-sidebar-card site-card border p-5">
              <h2 className="about-sidebar-heading mb-4">
                Education & Achievement
              </h2>
              <div className="divide-y divide-white/[0.06]">
                {[
                  {
                    title: "National Institute of Technology Srinagar",
                    meta: "B.Tech. in Computer Science and Engineering, CGPA 9.32",
                    detail: "Jul 2020 - Jul 2024",
                  },
                  {
                    title: "Graduate Aptitude Test in Engineering",
                    meta: "Computer Science, AIR 1646",
                    detail: "2023, third year",
                  },
                ].map((item) => (
                  <div key={item.title} className="py-4 first:pt-0 last:pb-0">
                    <p className="text-[11px] text-zinc-700 mb-1.5">
                      {item.detail}
                    </p>
                    <h4 className="text-xs font-semibold text-zinc-300 leading-snug">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-zinc-600 leading-relaxed mt-1">
                      {item.meta}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="about-sidebar-card site-card border p-5">
              <h2 className="about-sidebar-heading mb-4">
                Stack
              </h2>
              <div className="space-y-5">
                {[
                  {
                    label: "Languages",
                    items: ["Python", "C / C++", "CUDA", "Bash"],
                  },
                  {
                    label: "Frameworks",
                    items: [
                      "PyTorch",
                      "NumPy",
                      "TensorRT-LLM",
                      "vLLM",
                      "cuBLAS",
                      "CuTe",
                      "CUTLASS",
                    ],
                  },
                  {
                    label: "Systems & Tools",
                    items: [
                      "Linux",
                      "Docker",
                      "Slurm",
                      "Git",
                      "Nsight Systems",
                      "Nsight Compute",
                      "Vim",
                    ],
                  },
                ].map((group) => (
                  <div key={group.label}>
                    <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-2.5">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <span
                          key={item}
                          className="rounded-md bg-zinc-800/70 border border-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-500"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function WritingsPage({ navigate }: { navigate: (path: string) => void }) {
  const [active, setActive] = useState<Tag | null>(null);
  const filtered = active
    ? writings.filter((writing) => writing.tags.includes(active))
    : writings;
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const featured = active ? null : sorted[0] ?? null;
  const archiveItems = featured ? sorted.slice(1) : sorted;
  const featuredImage =
    featured?.slug === "cute-layouts"
      ? hrefFor(`/writings/${featured.slug}/images/svg/06b_layout_algebra_overview.svg`)
      : null;
  const archiveGrouped = archiveItems.reduce<Array<{ year: string; items: Writing[] }>>(
    (groups, writing) => {
      const year = new Date(writing.date).getFullYear().toString();
      const group = groups.find((entry) => entry.year === year);

      if (group) {
        group.items.push(writing);
      } else {
        groups.push({ year, items: [writing] });
      }

      return groups;
    },
    [],
  );
  const tagCounts = ALL_TAGS.map((tag) => ({
    tag,
    count: writings.filter((writing) => writing.tags.includes(tag)).length,
  }));

  return (
    <main className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
      <div className="pt-16 pb-24">
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-10 lg:gap-16 items-start">
          <aside className="lg:sticky lg:top-[88px] space-y-8">
            <div>
              <p className="text-sm text-amber-400 font-medium mb-3">
                Writing
              </p>
              <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.25rem] font-semibold text-white tracking-tight leading-tight mb-3">
                Writings
              </h1>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Technical notes on CUDA, GPU architecture, LLM inference,
                profiling, and performance engineering.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-5">
                {[
                  { label: "Notes", value: writings.length },
                  { label: "Topics", value: ALL_TAGS.length },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="site-stat-strip rounded-lg border border-white/[0.06] bg-zinc-900/35 px-3 py-2"
                  >
                    <p className="text-lg font-semibold text-zinc-200 leading-none">
                      {item.value}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-700 mt-1.5">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="site-card rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Topics
              </h2>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active === null
                      ? "bg-amber-500/15 text-amber-400"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                >
                  <span>All</span>
                  <span className="text-xs opacity-70">{writings.length}</span>
                </button>

                {tagCounts.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setActive(active === tag ? null : tag)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active === tag
                        ? "bg-amber-500/15 text-amber-400"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span>{tag}</span>
                    <span className="text-xs opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="flex items-center justify-between gap-4 mb-5">
              <p className="text-xs text-zinc-600">
                {filtered.length} {filtered.length === 1 ? "note" : "notes"}
                {active ? ` tagged ${active}` : ""}
              </p>

              {active && (
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>

            {featured && (
              <a
                href={hrefFor(`/writings/${featured.slug}/`)}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/writings/${featured.slug}/`);
                }}
                className="site-feature-card group grid md:grid-cols-[minmax(0,1fr)_280px] gap-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/40 hover:border-white/[0.11] transition-all duration-200 mb-10"
              >
                <div className="p-6 sm:p-7">
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {featured.tags.map((tag) => (
                      <Chip key={tag} label={tag} />
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest mb-3">
                    Latest note
                  </p>
                  <h2 className="text-2xl font-semibold text-zinc-100 group-hover:text-white leading-tight mb-4 transition-colors">
                    {featured.title}
                  </h2>
                  <p className="text-sm text-zinc-500 leading-relaxed mb-6 max-w-[620px]">
                    {featured.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-zinc-600">
                    <span>{fmtDate(featured.date)}</span>
                    <span>-</span>
                    <span>{featured.readingTime} min read</span>
                  </div>
                </div>

                {featuredImage && (
                  <div className="hidden md:block border-l border-white/[0.06] bg-white/[0.025] overflow-hidden">
                    <img
                      src={featuredImage}
                      alt=""
                      className="h-full w-full object-cover object-left-top opacity-90 grayscale-[0.1] group-hover:opacity-100 transition-opacity"
                      loading="lazy"
                    />
                  </div>
                )}
              </a>
            )}

            {archiveGrouped.length > 0 ? (
              <div className="space-y-10">
                {archiveGrouped.map((group) => (
                  <section key={group.year}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                        {group.year}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                    </div>

                    <div className="site-card rounded-xl border border-white/[0.06] bg-zinc-900/35 overflow-hidden divide-y divide-white/[0.06]">
                      {group.items.map((writing) => (
                        <WritingCard
                          key={writing.slug}
                          writing={writing}
                          navigate={navigate}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="site-card rounded-xl border border-white/[0.06] bg-zinc-900/35 py-20 text-center text-zinc-600 text-sm">
                No writings with that topic yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function ArticlePage({
  writing,
  navigate,
}: {
  writing: Writing;
  navigate: (path: string) => void;
}) {
  const articleIndex = writings.findIndex((item) => item.slug === writing.slug);
  const previous = articleIndex > 0 ? writings[articleIndex - 1] : null;
  const next =
    articleIndex >= 0 && articleIndex < writings.length - 1
      ? writings[articleIndex + 1]
      : null;
  const [activeSection, setActiveSection] = useState("top");
  const [readingProgress, setReadingProgress] = useState(0);
  const tocListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const sectionIds = ["top", ...writing.toc.map((item) => item.id)];
    let animationFrame = 0;

    const updateActiveSection = () => {
      animationFrame = 0;
      const activationLine = Math.min(180, window.innerHeight * 0.24);
      let nextSection = "top";

      for (const sectionId of sectionIds) {
        const section = document.getElementById(sectionId);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= activationLine) {
          nextSection = sectionId;
        } else {
          break;
        }
      }

      setActiveSection((current) =>
        current === nextSection ? current : nextSection,
      );

      const article = document.getElementById("top");
      if (article) {
        const articleTop = window.scrollY + article.getBoundingClientRect().top;
        const readableDistance = Math.max(
          article.offsetHeight - window.innerHeight,
          1,
        );
        const nextProgress = Math.round(
          Math.min(
            100,
            Math.max(0, ((window.scrollY - articleTop) / readableDistance) * 100),
          ),
        );
        setReadingProgress((current) =>
          current === nextProgress ? current : nextProgress,
        );
      }
    };

    const scheduleUpdate = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateActiveSection);
      }
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [writing.slug, writing.toc]);

  useEffect(() => {
    const list = tocListRef.current;
    const activeLink = list?.querySelector<HTMLElement>(".is-active");
    if (!list || !activeLink) return;

    const activeTop = activeLink.offsetTop;
    const activeBottom = activeTop + activeLink.offsetHeight;
    const visibleTop = list.scrollTop;
    const visibleBottom = visibleTop + list.clientHeight;

    if (activeTop < visibleTop) {
      list.scrollTo({ top: Math.max(0, activeTop - 12) });
    } else if (activeBottom > visibleBottom) {
      list.scrollTo({ top: activeBottom - list.clientHeight + 12 });
    }
  }, [activeSection]);

  return (
    <main className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-10">
      <div className="pt-10 pb-24">
        <a
          href={hrefFor("/writings/")}
          onClick={(event) => {
            event.preventDefault();
            navigate("/writings/");
          }}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors mb-9"
        >
          <ArrowLeft size={14} />
          Back to writings
        </a>

        <div className="grid lg:grid-cols-[minmax(0,880px)_280px] gap-8 lg:gap-10 items-start">
          <article id="top" className="min-w-0 scroll-mt-24">
            <div className="article-reading-surface">
              <header className="mx-auto mb-9 max-w-[760px]">
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {writing.tags.map((tag) => (
                    <Chip key={tag} label={tag} />
                  ))}
                </div>
                <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.15rem] sm:text-[2.85rem] font-semibold text-white leading-[1.08] tracking-tight mb-5">
                  {writing.title}
                </h1>
                <p className="text-base text-zinc-500 leading-relaxed mb-5">
                  {writing.description}
                </p>
                <div className="flex items-center gap-3 text-xs text-zinc-600">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={11} />
                    {fmtDate(writing.date)}
                  </span>
                  <span>-</span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={11} />
                    {writing.readingTime} min read
                  </span>
                </div>
              </header>

              <div className="mx-auto max-w-[760px]">
                <Divider />
              </div>

              <div
                className="article-body mx-auto mt-9 max-w-[760px] text-[15.5px] text-zinc-400 leading-[1.92]"
                dangerouslySetInnerHTML={{ __html: writing.bodyHtml }}
              />

              <div className="mx-auto mt-16 max-w-[760px] border-t border-white/[0.06] pt-8">
                <div className="grid sm:grid-cols-2 gap-4">
                  {previous ? (
                    <ArticleNavLink
                      label="Previous article"
                      writing={previous}
                      navigate={navigate}
                    />
                  ) : (
                    <div />
                  )}
                  {next ? (
                    <ArticleNavLink
                      label="Next article"
                      writing={next}
                      navigate={navigate}
                      align="right"
                    />
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </div>
          </article>

          <aside className="hidden lg:block sticky top-[84px] self-start">
            {writing.toc.length > 0 && (
              <div className="site-toc-card overflow-hidden border">
                <div className="site-toc-header">
                  <div className="site-toc-title-row">
                    <p className="site-toc-eyebrow">On this page</p>
                    <span className="site-toc-percentage">
                      {readingProgress}%
                    </span>
                  </div>
                  <div
                    className="site-toc-progress"
                    role="progressbar"
                    aria-label="Article reading progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={readingProgress}
                  >
                    <span style={{ width: `${readingProgress}%` }} />
                  </div>
                  <div className="site-toc-meta">
                    <span>{writing.readingTime} min read</span>
                    <span aria-hidden="true">/</span>
                    <span>{writing.toc.length} sections</span>
                  </div>
                </div>
                <nav className="site-toc-nav" aria-label="Article sections">
                  <ul ref={tocListRef} className="site-toc-list">
                    <li className="site-toc-item site-toc-item-level-2">
                      <a
                        href="#top"
                        className={`site-toc-link site-toc-level-2 ${
                          activeSection === "top" ? "is-active" : ""
                        }`}
                        aria-current={
                          activeSection === "top" ? "location" : undefined
                        }
                        onClick={() => setActiveSection("top")}
                      >
                        Overview
                      </a>
                    </li>
                    {writing.toc.map((item) => (
                      <li
                        key={item.id}
                        className={`site-toc-item site-toc-item-level-${item.level}`}
                      >
                        <a
                          href={`#${item.id}`}
                          className={`site-toc-link site-toc-level-${item.level} ${
                            activeSection === item.id ? "is-active" : ""
                          }`}
                          aria-current={
                            activeSection === item.id ? "location" : undefined
                          }
                          onClick={() => setActiveSection(item.id)}
                        >
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function ArticleNavLink({
  label,
  writing,
  navigate,
  align = "left",
}: {
  label: string;
  writing: Writing;
  navigate: (path: string) => void;
  align?: "left" | "right";
}) {
  const path = `/writings/${writing.slug}/`;

  return (
    <a
      href={hrefFor(path)}
      onClick={(event) => {
        event.preventDefault();
        navigate(path);
      }}
      className={`site-card site-card-interactive group rounded-xl border border-white/[0.06] bg-zinc-900/35 hover:bg-zinc-900/65 hover:border-white/[0.10] p-4 transition-all ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <p className="text-[11px] uppercase tracking-widest text-zinc-700 mb-2">
        {label}
      </p>
      <p className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors leading-snug">
        {writing.title}
      </p>
      <p className="text-[11px] text-zinc-700 mt-2">
        {fmtDate(writing.date)}
      </p>
    </a>
  );
}

function NotFoundPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <main className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
      <section className="min-h-[60vh] pt-20 pb-24">
        <p className="text-sm text-amber-400 font-medium mb-3">404</p>
        <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.25rem] font-semibold text-white tracking-tight leading-tight mb-4">
          Page not found
        </h1>
        <p className="text-base text-zinc-500 max-w-[620px] leading-relaxed mb-8">
          This site has Home, About, Writings, and writing detail pages. The
          path you opened does not exist yet.
        </p>
        <a
          href={hrefFor("/")}
          onClick={(event) => {
            event.preventDefault();
            navigate("/");
          }}
          className="site-primary-action inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150"
        >
          Back home
          <ArrowRight size={14} />
        </a>
      </section>
    </main>
  );
}

function getPageTitle(route: Route) {
  if (route.kind === "home") return "Shah Fahad";
  if (route.kind === "about") return "About | Shah Fahad";
  if (route.kind === "writings") return "Writings | Shah Fahad";
  if (route.kind === "article") {
    const writing = writings.find((item) => item.slug === route.slug);
    return writing ? `${writing.title} | Shah Fahad` : "Writing | Shah Fahad";
  }
  return "Page not found | Shah Fahad";
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#171816" : "#e8e7e0");
  }, [theme]);

  useEffect(() => {
    document.title = getPageTitle(route);
  }, [route]);

  const currentWriting = useMemo(() => {
    return route.kind === "article"
      ? writings.find((writing) => writing.slug === route.slug) ?? null
      : null;
  }, [route]);

  const navigate = (path: string) => {
    const nextPath = hrefFor(path);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setRoute(routeFromPath(nextPath));
    window.scrollTo(0, 0);
  };
  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <div
      className={`min-h-screen site-shell theme-${theme} antialiased`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Header
        route={route}
        navigate={navigate}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      {route.kind === "home" && <HomePage navigate={navigate} />}
      {route.kind === "about" && <AboutPage navigate={navigate} />}
      {route.kind === "writings" && <WritingsPage navigate={navigate} />}
      {route.kind === "article" && currentWriting && (
        <ArticlePage writing={currentWriting} navigate={navigate} />
      )}
      {(route.kind === "not-found" || (route.kind === "article" && !currentWriting)) && (
        <NotFoundPage navigate={navigate} />
      )}
    </div>
  );
}
