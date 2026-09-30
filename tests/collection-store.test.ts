/**
 * SAM-15 — store de coleção: cache hit/miss, TTL, deduplicação de requests,
 * upsert/remove/invalidate/clear, isolamento por escopo e erro de fetch.
 */
import { describe, expect, it, vi } from "vitest";

import { createCollectionStore, selectCollection, selectMeta } from "@/lib/stores/collection-store";

type Item = { id: string; name: string };

function makeStore(start = 1_000) {
  let time = start;
  const store = createCollectionStore<Item>(undefined, () => time);
  return { store, tick: (ms: number) => { time += ms; } };
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("createCollectionStore", () => {
  it("seed entra no estado inicial (snapshot do servidor = primeiro render do cliente)", () => {
    const store = createCollectionStore<Item>({ scope: "teams:a", items: [{ id: "1", name: "A" }] });
    expect(selectCollection<Item>("teams:a")(store.getInitialState()).map((i) => i.id)).toEqual(["1"]);
    expect(selectCollection<Item>("teams:a")(store.getState())).toEqual(selectCollection<Item>("teams:a")(store.getInitialState()));
  });

  it("hydrate semeia o escopo e o selector devolve os itens na ordem", () => {
    const { store } = makeStore();
    store.getState().hydrate("teams:a", [{ id: "2", name: "B" }, { id: "1", name: "A" }]);

    expect(selectCollection<Item>("teams:a")(store.getState()).map((i) => i.name)).toEqual(["B", "A"]);
    expect(selectMeta<Item>("teams:a")(store.getState()).updatedAt).toBe(1_000);
  });

  it("cache hit dentro do TTL não chama o fetcher; stale busca de novo", async () => {
    const { store, tick } = makeStore();
    const fetcher = vi.fn().mockResolvedValue([{ id: "1", name: "A" }]);

    await store.getState().ensure("teams:a", fetcher, { ttlMs: 10_000 });
    tick(5_000);
    await store.getState().ensure("teams:a", fetcher, { ttlMs: 10_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    tick(6_000);
    await store.getState().ensure("teams:a", fetcher, { ttlMs: 10_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("chamadas simultâneas para o mesmo escopo compartilham uma única request", async () => {
    const { store } = makeStore();
    const pending = deferred<Item[]>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);

    const a = store.getState().ensure("teams:a", fetcher);
    const b = store.getState().ensure("teams:a", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(selectMeta<Item>("teams:a")(store.getState()).loading).toBe(true);

    pending.resolve([{ id: "1", name: "A" }]);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(selectMeta<Item>("teams:a")(store.getState()).loading).toBe(false);
  });

  it("escopos diferentes não se misturam (tenant isolation)", async () => {
    const { store } = makeStore();
    store.getState().hydrate("teams:a", [{ id: "1", name: "Alpha" }]);
    store.getState().hydrate("teams:b", [{ id: "9", name: "Beta" }]);

    expect(selectCollection<Item>("teams:a")(store.getState()).map((i) => i.id)).toEqual(["1"]);
    expect(selectCollection<Item>("teams:b")(store.getState()).map((i) => i.id)).toEqual(["9"]);
    store.getState().remove("teams:a", "9");
    expect(selectCollection<Item>("teams:b")(store.getState())).toHaveLength(1);
  });

  it("upsert adiciona no início/fim ou substitui no lugar; remove tira só do escopo", () => {
    const { store } = makeStore();
    store.getState().hydrate("teams:a", [{ id: "1", name: "A" }]);

    store.getState().upsert("teams:a", { id: "2", name: "B" });
    store.getState().upsert("teams:a", { id: "0", name: "Z" }, "start");
    store.getState().upsert("teams:a", { id: "1", name: "A2" });
    expect(selectCollection<Item>("teams:a")(store.getState()).map((i) => i.name)).toEqual(["Z", "A2", "B"]);

    store.getState().remove("teams:a", "1");
    expect(selectCollection<Item>("teams:a")(store.getState()).map((i) => i.id)).toEqual(["0", "2"]);
    expect(store.getState().byId["1"]).toBeUndefined();
  });

  it("invalidate mantém os dados visíveis mas força a próxima ensure a buscar", async () => {
    const { store } = makeStore();
    const fetcher = vi.fn().mockResolvedValue([{ id: "1", name: "novo" }]);
    store.getState().hydrate("teams:a", [{ id: "1", name: "velho" }]);

    store.getState().invalidate("teams:a");
    expect(selectCollection<Item>("teams:a")(store.getState())[0].name).toBe("velho");

    await store.getState().ensure("teams:a", fetcher, { ttlMs: 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(selectCollection<Item>("teams:a")(store.getState())[0].name).toBe("novo");
  });

  it("erro de fetch registra a mensagem, não deixa loading preso e permite tentar de novo", async () => {
    const { store } = makeStore();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([{ id: "1", name: "A" }]);

    await expect(store.getState().ensure("teams:a", fetcher)).rejects.toThrow("boom");
    const meta = selectMeta<Item>("teams:a")(store.getState());
    expect(meta.loading).toBe(false);
    expect(meta.error).toBe("boom");

    await store.getState().ensure("teams:a", fetcher);
    expect(selectCollection<Item>("teams:a")(store.getState())).toHaveLength(1);
    expect(selectMeta<Item>("teams:a")(store.getState()).error).toBeNull();
  });

  it("clear apaga tudo (logout / troca de usuário)", () => {
    const { store } = makeStore();
    store.getState().hydrate("teams:a", [{ id: "1", name: "A" }]);
    store.getState().clear();
    expect(store.getState().byId).toEqual({});
    expect(selectCollection<Item>("teams:a")(store.getState())).toEqual([]);
  });

  it("o selector devolve a mesma referência enquanto nada muda (sem re-render inútil)", () => {
    const { store } = makeStore();
    const select = selectCollection<Item>("teams:a");
    store.getState().hydrate("teams:a", [{ id: "1", name: "A" }]);

    const first = select(store.getState());
    store.getState().invalidate("teams:a"); // muda só meta
    expect(select(store.getState())).toBe(first);

    store.getState().upsert("teams:a", { id: "1", name: "A2" });
    expect(select(store.getState())).not.toBe(first);
  });
});
