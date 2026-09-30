export default function ActivitiesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 sm:p-6">
        <div className="h-3 w-28 rounded-full bg-white/10" />
        <div className="mt-4 h-10 w-52 rounded-full bg-white/10" />
        <div className="mt-4 h-5 max-w-3xl rounded-full bg-white/10" />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
            <div className="h-11 w-11 rounded-2xl bg-white/10" />
            <div className="mt-4 h-8 w-24 rounded-full bg-white/10" />
            <div className="mt-3 h-4 w-28 rounded-full bg-white/10" />
            <div className="mt-3 h-3 w-32 rounded-full bg-white/10" />
          </div>
        ))}
      </section>

      <section className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-11 w-24 rounded-full bg-white/10" />
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3.5">
              <div className="h-4 w-24 rounded-full bg-white/10" />
              <div className="mt-4 h-5 w-full rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-3 w-24 rounded-full bg-white/10" />
          <div className="h-px flex-1 bg-white/8" />
        </div>

        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="rounded-[26px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex gap-4">
                <div className="h-[52px] w-[52px] rounded-[20px] bg-white/10" />
                <div className="space-y-3">
                  <div className="h-5 w-48 rounded-full bg-white/10" />
                  <div className="h-4 w-36 rounded-full bg-white/10" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[420px] xl:flex-1">
                {Array.from({ length: 4 }).map((__, metricIndex) => (
                  <div key={metricIndex} className="rounded-[18px] border border-white/8 bg-black/10 px-3 py-3 sm:px-4">
                    <div className="h-5 w-20 rounded-full bg-white/10" />
                    <div className="mt-3 h-3 w-16 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
