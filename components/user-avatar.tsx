type UserAvatarProps = {
  name: string;
  image?: string | null;
  size?: "sm" | "md";
};

const sizeClassMap = {
  sm: "h-10 w-10 rounded-[16px] text-sm",
  md: "h-11 w-11 rounded-[18px] text-sm",
};

export function UserAvatar({ name, image, size = "sm" }: UserAvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RY";

  const sizeClass = sizeClassMap[size];

  if (image) {
    return (
      <span
        className={`relative block shrink-0 overflow-hidden border border-white/14 bg-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ${sizeClass}`}
        style={{
          backgroundImage: `url(${image})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center border border-white/14 bg-[linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.08))] font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ${sizeClass}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
