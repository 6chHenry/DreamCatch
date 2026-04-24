import type { Metadata } from "next";
import Link from "next/link";
import { Moon, ArrowLeft, BookOpen, Users, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "关于 · 掬梦 DreamCup",
  description: "为什么做这款产品：在梦还没消散之前，把它轻轻捧住。",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="返回首页"
          >
            <ArrowLeft size={16} className="text-white/80" />
          </Link>
          <Moon className="text-indigo-400" size={20} />
          <h1 className="text-lg font-semibold text-white/90">关于掬梦</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/journal"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">梦境日志</span>
          </Link>
          <Link
            href="/persons"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-sm text-indigo-200/90 transition-colors"
          >
            <Users size={14} />
            <span className="hidden sm:inline">人物库</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <p className="text-xs uppercase tracking-widest text-indigo-400/80 mb-3">DreamCup</p>
        <h2 className="text-2xl sm:text-3xl font-light text-white/95 leading-snug mb-8">
          在梦还没消散之前，把它轻轻捧住。
        </h2>

        <div className="space-y-8 text-sm text-white/65 leading-relaxed">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-white/85 flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-400 shrink-0" />
              初衷
            </h3>
            <p>
              很多人都有过这样的体验：醒来的一瞬间，梦里还很清楚，洗漱完就只剩几个模糊的画面，到了中午几乎想不起来。梦像水里的倒影，一碰就碎。
            </p>
            <p>
              我做「掬梦」（英文名 DreamCup：cup 既有双手捧起之意，也像一只盛梦的杯子），是因为我相信这些碎片值得被认真对待——不是为了解梦算命，而是给自己留一条可追溯的记忆线索。当口述被整理成文字、结构化成场景与人物，再慢慢补全细节、甚至变成画面时，也是在练习和那个半睡半醒的自己对话。
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-white/85">想解决什么</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-indigo-500/60">
              <li>
                <span className="text-white/75">降低记录门槛</span>：刚醒时手指发软、脑子发懵，能先说一段话或丢一段录音，比立刻写长文更现实。
              </li>
              <li>
                <span className="text-white/75">帮混乱变有序</span>：口语里的重复、跳跃和口误，交给模型整理成可读文本，再抽成场景、人物与情节，方便日后检索和联想。
              </li>
              <li>
                <span className="text-white/75">多留一层感官锚点</span>：图像与视频不是目的本身，而是帮助回忆的「把手」——有时一张图比一句话更能把你拽回那个房间里的光。
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-white/85">使用上的一点期待</h3>
            <p>
              工具会尽量贴近你的原话，但梦境终究是你的私体验；模型可能误解、也可能保守到不敢写——重要的地方，仍值得你亲手改一改、多记一句。
            </p>
            <p>
              数据默认留在你信任的环境里；若部署在云端，请像对待日记一样保管好账号与密钥。掬梦更像一本会帮你排版插图的梦笔记本，而不是社交广场。
            </p>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 space-y-2">
            <p className="text-xs text-white/45">
              若你愿意，从首页录下今早还记得的那一段就好。愿你的梦，都能被温柔地掬住一角。
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
            >
              去记录梦境 <span aria-hidden>→</span>
            </Link>
          </section>

          <section className="space-y-3 pt-2">
            <h3 className="text-sm font-medium text-white/85">联系我</h3>
            <p className="text-white/50">欢迎来 GitHub 上交流或提 issue。</p>
            <a
              href="https://github.com/6chHenry"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 text-sm text-indigo-300/95 hover:text-indigo-200 transition-colors"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/90 hover:bg-white/15">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.207 11.385.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.204.085 1.84 1.236 1.84 1.236 1.07 1.835 2.807 1.304 3.492.998.108-.776.417-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.47-2.38 1.235-3.22-.123-.304-.535-1.524.116-3.176 0 0 1.007-.32 3.3 1.23.957-.266 1.98-.4 3.001-.404 1.02.005 2.047.138 3.006.404 2.29-1.55 3.295-1.23 3.295-1.23.655 1.653.24 2.872.12 3.175.77.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.19.69.8.57C20.565 22.095 24 17.592 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </span>
              <span>6chHenry</span>
            </a>
          </section>
        </div>

        <footer className="mt-12 pt-8 border-t border-white/10">
          <p className="text-xs text-white/40">
            开源仓库：{" "}
            <a
              href="https://github.com/6chHenry/DreamCup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400/90 hover:text-indigo-300 underline underline-offset-2"
            >
              github.com/6chHenry/DreamCup
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
