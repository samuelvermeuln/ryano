export default function ReportsLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] animate-pulse">
      {Array.from({ length: 2 }).map((_, index) => (
        <section key={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5 sm:p-6">
          <div className="h-7 w-48 rounded-full bg-white/10" />
          <div className="mt-3 h-4 w-72 rounded-full bg-white/10" />
          <div className="mt-6 grid gap-3">
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div key={rowIndex} className="rounded-[18px] border border-white/8 bg-black/10 px-4 py-4">
                <div className="h-4 w-28 rounded-full bg-white/10" />
                <div className="mt-3 h-4 w-full rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
