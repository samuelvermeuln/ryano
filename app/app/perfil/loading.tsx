export default function ProfileLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="h-[60px] w-[60px] rounded-[22px] bg-white/10 sm:h-[72px] sm:w-[72px]" />
            <div>
              <div className="h-3 w-24 rounded-full bg-white/10" />
              <div className="mt-4 h-10 w-48 rounded-full bg-white/10" />
              <div className="mt-4 h-5 w-[28rem] max-w-full rounded-full bg-white/10" />
              <div className="mt-4 flex gap-2">
                <div className="h-9 w-36 rounded-full bg-white/10" />
                <div className="h-9 w-36 rounded-full bg-white/10" />
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-4 xl:min-w-[280px]">
            <div className="h-4 w-20 rounded-full bg-white/10" />
            <div className="mt-3 h-8 w-40 rounded-full bg-white/10" />
            <div className="mt-4 h-2.5 w-full rounded-full bg-white/10" />
            <div className="mt-3 h-4 w-48 rounded-full bg-white/10" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.5fr)]">
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <section key={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
              <div className="flex items-start gap-3 border-b border-white/10 pb-5">
                <div className="h-11 w-11 rounded-2xl bg-white/10" />
                <div>
                  <div className="h-6 w-44 rounded-full bg-white/10" />
                  <div className="mt-3 h-4 w-72 rounded-full bg-white/10" />
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {Array.from({ length: index === 2 ? 3 : index === 1 ? 2 : 4 }).map((__, fieldIndex) => (
                  <div key={fieldIndex} className="rounded-[20px] border border-white/8 bg-black/10 px-4 py-4">
                    <div className="h-4 w-24 rounded-full bg-white/10" />
                    <div className="mt-4 h-6 w-full rounded-full bg-white/10" />
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-[24px] border border-white/10 bg-black/10 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="h-4 w-36 rounded-full bg-white/10" />
              <div className="flex gap-3">
                <div className="h-11 w-28 rounded-[18px] bg-white/10" />
                <div className="h-11 w-36 rounded-[18px] bg-white/10" />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <section key={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
              <div className="h-6 w-40 rounded-full bg-white/10" />
              <div className="mt-3 h-4 w-60 rounded-full bg-white/10" />
              <div className="mt-5 grid gap-3">
                {Array.from({ length: index === 0 ? 3 : 2 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-4">
                    <div className="h-4 w-24 rounded-full bg-white/10" />
                    <div className="mt-3 h-4 w-32 rounded-full bg-white/10" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
