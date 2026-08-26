export default function ActivityDetailLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 sm:p-6">
        <div className="h-3 w-24 rounded-full bg-white/10" />
        <div className="mt-4 h-10 w-64 rounded-full bg-white/10" />
        <div className="mt-4 h-5 max-w-3xl rounded-full bg-white/10" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-4">
              <div className="h-3 w-20 rounded-full bg-white/10" />
              <div className="mt-3 h-8 w-24 rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
            <div className="h-6 w-40 rounded-full bg-white/10" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, metricIndex) => (
                <div key={metricIndex} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-4">
                  <div className="h-4 w-24 rounded-full bg-white/10" />
                  <div className="mt-3 h-5 w-20 rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
