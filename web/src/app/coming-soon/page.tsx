export default function ComingSoonPage () {
  return (
    <main className="mx-auto flex w-full max-w-screen-lg flex-col items-center gap-6 px-4 py-16 text-center sm:py-20">
      <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-pink-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-600">
        Coming Soon
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        Albums and personalized story videos
      </h1>
      <p className="max-w-xl text-sm text-zinc-600 sm:text-base">
        We are building a new experience for curated albums and short story videos.
        This page is a placeholder for now.
      </p>
      <div className="mt-2 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200/80 bg-white/80 p-6 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">Albums</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">Beautiful collections</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Curate pages into shareable albums with themes and highlights.
          </p>
        </div>
        <div className="rounded-3xl border border-zinc-200/80 bg-white/80 p-6 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-600">Story videos</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">Short personalized clips</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Turn your book into a cinematic, narrated story video.
          </p>
        </div>
      </div>
    </main>
  )
}
