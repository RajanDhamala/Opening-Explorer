import { ArrowRight, Terminal, Zap, LayoutTemplate, Github } from "lucide-react";

const Pill = ({ label }: { label: string }) => (
  <span className="rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-mono text-muted-foreground 
  shadow-sm shadow-black/5 backdrop-blur">
    {label}
  </span>
);

const FeatureCard = ({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) => (
  <div className="space-y-1 rounded-xl border bg-card/70 p-3 shadow-sm shadow-black/5">
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/80">
      <Icon className="h-3.5 w-3.5" />
      <span>{title}</span>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
  </div>
);

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/90 to-background/60 text-foreground">
      {/* soft glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 right-[-7rem] h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-5rem] left-[-6rem] h-56 w-56 rounded-full bg-emerald-500/25 blur-3xl" />
      </div>

      {/* NAVBAR */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 md:py-8">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-background/80 shadow-sm shadow-black/5 backdrop-blur">
            <span className="bg-gradient-to-tr from-primary to-primary/70 bg-clip-text text-xl font-semibold text-transparent">
              SF
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight md:text-base">
              StackForge
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80 md:text-[12px]">
              stack-installer-cli
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-4 text-xs font-medium text-muted-foreground md:flex">
          <button className="rounded-full border border-transparent px-4 py-1.5 transition hover:border-border hover:bg-muted/60">
            Docs (soon)
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-full border bg-foreground text-background px-4 py-1.5
           font-semibold shadow-sm shadow-black/10 transition hover:bg-foreground/90" onClick={(e)=>{
        window.open("https://github.com/RajanDhamala/stackforge-cli", "_blank");
           }}>
            <Github className="h-3.5 w-3.5" />
            <span >Star the CLI</span>
          </button>
        </nav>
      </header>

      {/* MAIN */}
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-16 pt-2 md:flex-row md:items-center md:gap-12 md:pb-24">
        {/* LEFT */}
        <section className="flex-1 space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-[11px]
           font-medium text-muted-foreground shadow-sm shadow-black/5 backdrop-blur">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/10 text-[9px] text-emerald-500">
              ●
            </span>
            <span className="hidden sm:inline">New</span>
            <span className="text-foreground/80">React / TS / Express stack in one shot</span>
          </div>

          <div className="space-y-3">
            <h1 className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-4xl font-semibold leading-tight
             tracking-tight text-transparent sm:text-5xl md:text-5xl">
              Your own full‑stack boilerplate,
              <br className="hidden sm:block" /> shipped from the CLI.
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              <strong>stack-installer-cli</strong> by StackForge spins up React + TypeScript on the
              front, and Express, Mongoose, and Prisma on the back. Opinionated,
              batteries‑included, and styled like a modern React starter — without
              the noise.
            </p>
          </div>

          {/* CTA + command */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button className="group inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5
             text-sm font-semibold text-background shadow-[0_18px_45px_-18px_rgba(0,0,0,0.7)] transition hover:-translate-y-[1px] hover:bg-foreground/95"
              onClick={(e)=>{
                  window.open("https://www.npmjs.com/package/stack-installer-cli", "_blank");
             }}>
              <Zap className="h-4 w-4" />
              Init my stack
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <Pill label="npx stack-installer-cli" />
            </div>
          </div>

          {/* Features */}
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <FeatureCard
              icon={LayoutTemplate}
              title="Full boilerplate"
              text="Landing, auth, test page, API layer, and routing ready from init."
            />
            <FeatureCard
              icon={Zap}
              title="Modern stack"
              text="React + TS + Vite, Zustand, React Query, Axios, Tailwind, and more."
            />
            <FeatureCard
              icon={Terminal}
              title="Backend wired"
              text="Express server with Mongo via Mongoose plus Prisma ORM, pre‑hooked."
            />
          </div>
        </section>

        {/* RIGHT – preview card */}
        <section className="flex-1">
          <div className="relative mx-auto max-w-md rounded-3xl border bg-card/90 p-4 shadow-[0_22px_60px_-26px_rgba(0,0,0,0.9)] backdrop-blur">
            {/* window chrome */}
            <div className="mb-3 flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                stack-forge • dev
              </span>
            </div>

            <div className="space-y-3 rounded-2xl border bg-background/90 p-3">
              {/* fake UI */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="h-2.5 w-28 rounded-full bg-gradient-to-r from-primary/90 via-primary/60 to-primary/20" />
                  <div className="h-2 w-20 rounded-full bg-muted" />
                </div>
                <div className="h-7 w-20 rounded-full bg-gradient-to-r from-foreground via-foreground/80 to-foreground/50" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="h-14 rounded-xl bg-muted" />
                <div className="h-14 rounded-xl bg-muted" />
                <div className="h-14 rounded-xl bg-muted" />
              </div>

              {/* terminal preview */}
              <div className="space-y-1 rounded-xl border bg-black/95 p-3 text-[11px] font-mono text-emerald-100">
                <div className="flex items-center gap-2 text-emerald-400/80">
                  <Terminal className="h-3 w-3" />
                  <span>stack-forge ▸ init</span>
                </div>
                <p>$ npx stack-installer-cli</p>
                <p className="text-emerald-400/90">✔ Scaffolding React + TS + Vite app…</p>
                <p className="text-emerald-400/90">
                  ✔ Adding Express, Mongoose, Prisma boilerplate…
                </p>
                <p className="text-emerald-400/90">
                  ✔ Wiring Zustand store, React Query, and Axios wrapper…
                </p>
                <p className="text-emerald-400/90">✔ Dropping in landing + auth pages…</p>
                <p className="text-emerald-300/90">Done. Run: npm run dev</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;

