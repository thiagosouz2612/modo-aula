import { useEffect, useState } from "react";
import { loadCatalog, type Catalog } from "./bible";

/** catálogo da Bíblia (versões e livros) */
export function useCatalog() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let dead = false;
    loadCatalog()
      .then((c) => !dead && (setCat(c), setErr("")))
      .catch((e) => !dead && setErr(e instanceof Error && e.message !== "404" ? e.message : "Catálogo da Bíblia indisponível."));
    return () => {
      dead = true;
    };
  }, [n]);
  return { cat, err, retry: () => setN((x) => x + 1) };
}

/** valor que muda só depois de uma pausa na digitação */
export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}
