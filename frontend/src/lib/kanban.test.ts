import { moveCard, createId, type Column } from "@/lib/kanban";

describe("createId", () => {
  it("includes the given prefix", () => {
    expect(createId("card")).toMatch(/^card-/);
    expect(createId("col")).toMatch(/^col-/);
  });

  it("produces unique ids across rapid calls", () => {
    const ids = Array.from({ length: 100 }, () => createId("card"));
    expect(new Set(ids).size).toBe(100);
  });
});

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});
