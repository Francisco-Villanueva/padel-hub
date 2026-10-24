import { NotFoundView } from "@/components/not-found-view";

// Se muestra cuando una página llama a notFound() fuera del panel (por ejemplo, un link de alta que no existe).
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-4">
      <NotFoundView />
    </main>
  );
}
