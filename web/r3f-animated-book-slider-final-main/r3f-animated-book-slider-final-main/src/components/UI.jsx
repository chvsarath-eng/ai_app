import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import stories from "../story_content.json";

export const pageAtom = atom(0);
export const pages = [
  {
    front: "img-1",
    back: "img-2",
  },
];

// stories is an array of objects { page: 1, text: "..." }
// images are img-1 to img-11.
// Page 0 is already added (img-1, img-2).
// We need to add Page 1 to Page 9 (Stories 1-9, Images 3-11).
// Note: stories[0] is Story 1.

for (let i = 0; i < 9; i++) {
  pages.push({
    frontText: stories[i].text,
    back: `img-${i + 3}`,
  });
}

// Last page (Page 10)
// Front: Story 10
// Back: Generic Back Cover
pages.push({
  frontText: stories[9].text,
  back: "img-12", // Back Cover
});


export const UI = () => {
  const [page, setPage] = useAtom(pageAtom);

  useEffect(() => {
    const audio = new Audio("/audios/page-flip-01a.mp3");
    audio.play();
  }, [page]);

  return (
    <>
      <main className=" pointer-events-none select-none z-10 fixed  inset-0  flex justify-between flex-col">
        <a
          className="pointer-events-auto mt-10 ml-10"
          href="https://lessons.wawasensei.dev/courses/react-three-fiber"
        >
          <img className="w-20" src="/images/wawasensei-white.png" />
        </a>
        <div className="w-full pointer-events-auto flex justify-center items-end pb-8">
          <div className="bg-black/40 backdrop-blur-md rounded-full px-6 py-3 flex items-center gap-6 shadow-xl border border-white/10">
            <button
              className={`text-white/80 hover:text-white transition-colors text-sm font-bold tracking-widest ${page === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              PREV
            </button>
            <div className="flex gap-2 items-center">
              {[...pages, { title: 'Back Cover' }].map((_, index) => (
                <button
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index === page
                    ? "bg-white w-8"
                    : "bg-white/30 w-1.5 hover:bg-white/60 hover:w-3"
                    }`}
                  onClick={() => setPage(index)}
                />
              ))}
            </div>
            <button
              className={`text-white/80 hover:text-white transition-colors text-sm font-bold tracking-widest ${page === pages.length ? 'opacity-30 cursor-not-allowed' : ''}`}
              onClick={() => setPage((p) => Math.min(pages.length, p + 1))}
              disabled={page === pages.length}
            >
              NEXT
            </button>
          </div>
        </div>
      </main>


    </>
  );
};
