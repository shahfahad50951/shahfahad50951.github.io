import {
  useEffect,
  useMemo,
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
} from "lucide-react";
import writingsData from "../content/writings.json";

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
          ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20"
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
    { label: "Home", path: "/" },
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
    <header className="sticky top-0 z-50 border-b border-white/[0.05] bg-[#09090b]/85 backdrop-blur-xl">
      <div className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10 h-14 flex items-center justify-between">
        <nav
          className="hidden md:flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1"
          aria-label="Primary navigation"
        >
          {pages.map(({ label, path }) => (
            <a
              key={path}
              href={hrefFor(path)}
              onClick={internalClick(path)}
              className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
                isActive(path)
                  ? "text-white bg-white/[0.08]"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.045]"
              }`}
            >
              {label}
            </a>
          ))}
        </nav>

        <a
          href={hrefFor("/")}
          onClick={internalClick("/")}
          className={`md:hidden px-3.5 py-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] text-sm transition-colors ${
            route.kind === "home"
              ? "text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Home
        </a>

        <div className="hidden md:flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1">
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
            className="p-2 rounded-full border border-white/[0.07] bg-white/[0.035] text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label={themeLabel}
            title={themeLabel}
            type="button"
          >
            <ThemeIcon size={18} />
          </button>

          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-full border border-white/[0.07] bg-white/[0.035] text-zinc-500 hover:text-zinc-200 transition-colors"
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
                    ? "text-white bg-white/[0.08]"
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
        className="group block w-full text-left rounded-xl border border-white/[0.06] bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-white/[0.10] px-5 py-4 transition-all duration-200"
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
            className="text-zinc-600 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-0.5"
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
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-800/60 group-hover:bg-blue-500/15 border border-white/[0.06] group-hover:border-blue-500/20 transition-all duration-200">
            <ArrowRight
              size={13}
              className="text-zinc-500 group-hover:text-blue-400 transition-colors"
            />
          </div>
        </div>
      </div>
    </a>
  );
}

function HomePage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <main className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
      <section className="pt-16 pb-14">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-12 lg:gap-20 items-center">
          <div className="max-w-[760px]">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-xs text-blue-400 font-medium">
                Deep Learning Performance Engineer II
              </span>
            </div>

            <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.8rem] sm:text-[3.75rem] font-semibold leading-[1.05] tracking-tight text-white mb-6">
              Shah Fahad
            </h1>

            <p className="text-lg text-zinc-400 leading-relaxed mb-4">
              Deep Learning Performance Engineer II at NVIDIA, focused on
              benchmarking, profiling, and optimizing LLM workloads across
              modern datacenter GPU systems, primarily for inference and also
              for training.
            </p>

            <p className="text-sm text-zinc-600 leading-[1.85] mb-9 max-w-[700px]">
              My work spans silicon-to-simulator performance correlation for
              LLM workloads, kernel-level analysis with Nsight Systems and
              Nsight Compute, C/C++ and Python benchmarking infrastructure, and
              optimization work across PyTorch, TensorRT-LLM, NeMo, CUDA
              kernels, and HPC clusters.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href={CONTACT.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.09] hover:border-white/[0.13] px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-white transition-all duration-150"
              >
                <Linkedin size={15} />
                LinkedIn
              </a>
              <a
                href={`mailto:${CONTACT.email}`}
                className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.09] hover:border-white/[0.13] px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-white transition-all duration-150"
              >
                <Mail size={15} />
                Email
              </a>
            </div>
          </div>

          <aside className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-5">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-5">
              Currently
            </h2>
            <div className="divide-y divide-white/[0.06]">
              {[
                {
                  label: "Role",
                  value: "Deep Learning Performance Engineer II",
                },
                {
                  label: "Work",
                  value: "LLM inference performance, profiling, benchmarking, and optimization",
                },
                {
                  label: "Systems",
                  value: "CUDA, TensorRT-LLM, PyTorch, Nsight, Slurm, HPC clusters",
                },
                {
                  label: "Location",
                  value: CONTACT.location,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-[11px] uppercase tracking-widest text-zinc-700">
                    {item.label}
                  </span>
                  <span
                    className={`text-xs text-zinc-400 leading-relaxed ${
                      item.label === "Role" ? "lg:whitespace-nowrap" : ""
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <Divider />

      <section className="py-14">
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-8 lg:gap-16 items-start">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">
              Recent Writings
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed mb-5">
              Notes on GPU architecture, CUDA, and performance engineering.
            </p>
            <a
              href={hrefFor("/writings/")}
              onClick={(event) => {
                event.preventDefault();
                navigate("/writings/");
              }}
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              View all writings
              <ArrowRight size={14} />
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-zinc-900/35 overflow-hidden">
            {writings.slice(0, 3).map((writing) => {
              const path = `/writings/${writing.slug}/`;

              return (
                <a
                  key={writing.slug}
                  href={hrefFor(path)}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(path);
                  }}
                  className="group grid md:grid-cols-[140px_minmax(0,1fr)_32px] gap-4 px-5 py-5 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.025] transition-colors"
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
                    <div className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-800/60 group-hover:bg-blue-500/15 border border-white/[0.06] group-hover:border-blue-500/20 transition-all duration-200">
                      <ArrowRight
                        size={13}
                        className="text-zinc-500 group-hover:text-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <Divider />

      <section className="py-14 pb-20">
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-8 lg:gap-16 items-start">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">
              Technical Surface
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              The areas that usually show up in my work and writing.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-10 gap-y-8">
            {[
              {
                title: "Performance Work",
                topics: [
                  "LLM Inference Optimization",
                  "LLM Benchmarking",
                  "GPU Profiling",
                  "Silicon Correlation",
                  "HPC Cluster Runs",
                ],
              },
              {
                title: "CUDA & Systems",
                topics: [
                  "CUDA Kernel Optimization",
                  "Memory Hierarchy",
                  "Roofline Model",
                  "Nsight Compute",
                  "TensorRT-LLM",
                ],
              },
            ].map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                  {group.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.topics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-white/[0.10] hover:bg-white/[0.04] transition-all cursor-default"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function AboutPage() {
  return (
    <main className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
      <div className="pt-16 pb-24">
        <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-12 lg:gap-24 items-start">
          <div className="space-y-12">
            <section className="max-w-[760px]">
              <p className="text-sm text-blue-400 font-medium mb-3">About</p>
              <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.25rem] sm:text-[2.75rem] font-semibold text-white tracking-tight leading-tight mb-5">
                Performance work at the boundary of LLM software and GPU
                systems.
              </h1>
              <p className="text-base text-zinc-400 leading-[1.8]">
                I am Shah Fahad, a Deep Learning Performance Engineer II at
                NVIDIA in Bengaluru. My work focuses on benchmarking, profiling,
                and optimizing LLM workloads across modern datacenter GPU
                systems, primarily for inference and also for training.
              </p>
            </section>

            {[
              {
                title: "What I Work On",
                paragraphs: [
                  "I work on the performance side of deep learning systems, where model software, GPU architecture, and large-scale cluster execution meet. The core loop is measurement, explanation, and optimization: understand what the workload is doing, find the limiting behavior, and turn that into a concrete improvement.",
                  "At NVIDIA, that spans LLM benchmarking, silicon-to-simulator performance correlation for LLM workloads, GPU kernel-level profiling, and infrastructure for repeatable performance analysis across HPC clusters.",
                ],
              },
              {
                title: "Current Focus",
                paragraphs: [
                  "My current focus is LLM inference performance, while also working on training workloads. I look at end-to-end behavior as well as lower-level bottlenecks: CPU launch overhead, kernel execution, memory movement, cluster repeatability, and hardware metric correlation.",
                  "The day-to-day tooling is a mix of hardware execution metrics, simulator-based projections, Slurm, Docker, Nsight Systems, Nsight Compute, and C/C++ and Python infrastructure.",
                ],
              },
              {
                title: "Technical Interests",
                paragraphs: [
                  "CUDA kernel optimization, memory hierarchy, Tensor Core programming, GPU profiling, LLM serving performance, HPC automation, and systems-level debugging.",
                  "I also like rebuilding deep learning abstractions from first principles: PyTorch-style operations down to NumPy, C++, CUDA kernels, cuBLAS baselines, and CuTe layout algebra.",
                ],
              },
              {
                title: "Writing",
                paragraphs: [
                  "I use this site for technical notes that are useful beyond a single debugging session: CUDA behavior, GPU performance models, memory semantics, profiling workflows, and LLM inference systems.",
                ],
              },
            ].map((section) => (
              <section key={section.title}>
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-5">
                  {section.title}
                </h2>
                <div className="space-y-4 text-[15px] text-zinc-400 leading-[1.85]">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-8">
            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Contact
              </h3>
              <div className="space-y-3">
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
                    className="flex items-center gap-2.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    <span className="text-zinc-700">{icon}</span>
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Experience
              </h3>
              <div className="space-y-5 border-l border-white/[0.07] pl-4">
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
                ].map((item) => (
                  <div key={`${item.role}-${item.date}`} className="relative">
                    <div className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-zinc-700 ring-4 ring-[#111113]" />
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
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Education & Achievement
              </h3>
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
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Stack
              </h3>
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
            </div>
          </div>
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
  const grouped = sorted.reduce<Array<{ year: string; items: Writing[] }>>(
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
              <p className="text-sm text-blue-400 font-medium mb-3">
                Writing
              </p>
              <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.25rem] font-semibold text-white tracking-tight leading-tight mb-3">
                Writings
              </h1>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Technical notes on CUDA, GPU architecture, LLM inference,
                profiling, and performance engineering.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Topics
              </h2>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active === null
                      ? "bg-blue-500/15 text-blue-400"
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
                        ? "bg-blue-500/15 text-blue-400"
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

            {grouped.length > 0 ? (
              <div className="space-y-10">
                {grouped.map((group) => (
                  <section key={group.year}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                        {group.year}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.06]" />
                    </div>

                    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/35 overflow-hidden divide-y divide-white/[0.06]">
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
              <div className="rounded-xl border border-white/[0.06] bg-zinc-900/35 py-20 text-center text-zinc-600 text-sm">
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

  return (
    <main className="max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-10">
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

        <div className="grid lg:grid-cols-[minmax(0,800px)_280px] gap-12 lg:gap-20 items-start">
          <article className="min-w-0 max-w-[800px]">
            <header className="mb-9">
              <div className="flex flex-wrap gap-1.5 mb-5">
                {writing.tags.map((tag) => (
                  <Chip key={tag} label={tag} />
                ))}
              </div>
              <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[2.15rem] sm:text-[2.85rem] font-semibold text-white leading-[1.08] tracking-tight mb-5">
                {writing.title}
              </h1>
              <p className="text-base text-zinc-500 leading-relaxed mb-5 max-w-[760px]">
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

            <Divider />

            <div
              className="article-body mt-9 max-w-[760px] text-[15px] text-zinc-400 leading-[1.9]"
              dangerouslySetInnerHTML={{ __html: writing.bodyHtml }}
            />

            <div className="mt-16 pt-8 border-t border-white/[0.06] max-w-[800px]">
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
          </article>

          <aside className="hidden lg:block sticky top-[84px] self-start space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                Article
              </p>
              <div className="divide-y divide-white/[0.06]">
                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-2 first:pt-0">
                  <span className="text-[11px] uppercase tracking-widest text-zinc-700">
                    Date
                  </span>
                  <span className="text-xs text-zinc-500">
                    {fmtDate(writing.date)}
                  </span>
                </div>
                <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-2">
                  <span className="text-[11px] uppercase tracking-widest text-zinc-700">
                    Read
                  </span>
                  <span className="text-xs text-zinc-500">
                    {writing.readingTime} min
                  </span>
                </div>
                <div className="py-2 last:pb-0">
                  <span className="block text-[11px] uppercase tracking-widest text-zinc-700 mb-2.5">
                    Topics
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {writing.tags.map((tag) => (
                      <Chip key={tag} label={tag} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {writing.toc.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                On this page
              </p>
              <ul className="space-y-1 max-h-[calc(100vh-360px)] overflow-auto pr-1">
                {writing.toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block w-full text-left text-xs py-1 px-2 rounded-md transition-colors leading-relaxed text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03]"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
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
      className={`group rounded-xl border border-white/[0.06] bg-zinc-900/35 hover:bg-zinc-900/65 hover:border-white/[0.10] p-4 transition-all ${
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
        <p className="text-sm text-blue-400 font-medium mb-3">404</p>
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
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.09] hover:border-white/[0.13] px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-white transition-all duration-150"
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
      {route.kind === "about" && <AboutPage />}
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
