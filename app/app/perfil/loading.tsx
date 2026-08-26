export default function ProfileLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] animate-pulse">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
        <div className="h-7 w-36 rounded-full bg-white/10" />
        <div className="mt-3 h-4 w-80 rounded-full bg-white/10" />
        <div className="mt-6 grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-4">
              <div className="h-4 w-28 rounded-full bg-white/10" />
              <div className="mt-3 h-5 w-full rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <section key={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
            <div className="h-6 w-32 rounded-full bg-white/10" />
            <div className="mt-4 grid gap-3">
              {Array.from({ length: index === 2 ? 2 : 4 }).map((__, rowIndex) => (
                <div key={rowIndex} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-4">
                  <div className="h-4 w-24 rounded-full bg-white/10" />
                  <div className="mt-3 h-4 w-full rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="xl:col-span-2 rounded-[24px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
        <div className="h-7 w-56 rounded-full bg-white/10" />
        <div className="mt-3 h-4 w-80 rounded-full bg-white/10" />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-4">
              <div className="h-4 w-28 rounded-full bg-white/10" />
              <div className="mt-3 h-5 w-full rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
