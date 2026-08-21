import Link from "next/link";

export function AuthLegal() {
  return (
    <p className="text-center text-xs leading-5 text-foreground/58">
      Ao continuar, você concorda com os{" "}
      <Link href="/termos" className="text-foreground/74 hover:text-foreground">
        Termos de Uso
      </Link>{" "}
      e a{" "}
      <Link href="/privacidade" className="text-foreground/74 hover:text-foreground">
        Política de Privacidade
      </Link>
      .
    </p>
  );
}
